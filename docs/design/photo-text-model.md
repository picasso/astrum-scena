# Модель текстовых полей фото: Title / Caption / Alt / Place / Captured / Slug

Единый справочник по тому, **откуда берётся** каждое текстовое поле фотографии, **какие у него
фолбэки** и **где оно показывается**. Заведён, чтобы устранить путаницу между близкими полями
(особенно `title` ↔ `caption` ↔ `slug`) и поддерживаться при любых изменениях резолверов.

Связь с другими документами:

- [`ADR-0010`](../adr/0010-auto-publish-then-enhance.md) — **модель автоматизации и публикации**
  (auto-publish-then-enhance): per-поле источники `authored → legacy → computed`, publish gate, ось
  `unlisted`. Источник истины по _семантике_ полей.
- Этот документ — **read-time модель**: как поля резолвятся в строку при рендере и на каких
  поверхностях показываются. Реализация: [`src/lib/portfolio/locale.ts`](../../src/lib/portfolio/locale.ts).

## Термины

- **authored** — значение, заданное владельцем (publication overlay / editorial). Явный override.
- **legacy** — значение из WordPress-дампа, перенесённое импортёром в поле контента.
- **computed** — вычисляется на чтении из других полей (место, год, имя файла), не хранится.

Поле хранения (в `src/content/photos/*.yaml`) и read-time резолвер — разные вещи. В поле `title`
импортёр уже кладёт **authored-или-legacy** результат; резолверы работают поверх.

## Главное правило (чтобы не путать)

`title`, `caption`, `slug` — **три разных поля с разными фолбэками**. Их нельзя смешивать:

- У поля **`title`** computed-фолбэка **нет**. Если нет authored и нет legacy title — title **не
  определён**. Точка. Ни «Place, YYYY», ни имя файла в поле title не попадают.
- **`«Place, YYYY»` — это `caption`** (computed-ветка caption). Отображаемое **имя** при отсутствии
  title показывает `caption` — но это фолбэк _отображения_, а не поля title.
- **Имя файла — фолбэк `slug`**. `slug` выводится из title; когда title не определён, slug берётся из
  имени файла мастера. Это отдельная ветка (slug ← имя файла). **Title из имени файла НЕ создаётся.**

Итого: `«Place, YYYY»` и `имя файла` — фолбэки **разных потребителей** (caption/display и slug), а не
поля title.

## Поля

| Поле                      | Где хранится                                | Источник (приоритет)                       | Фолбэк при чтении                                               | Резолвер                                                       |
| ------------------------- | ------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------- |
| **title** (поле)          | `photo.title` (обязателен, оба локали)      | authored → legacy                          | нет — если ни того, ни другого, title не определён              | — (поле)                                                       |
| **имя (display)**         | — (вычисляется)                             | title                                      | title → `caption`                                               | [`resolvePhotoDisplayName`](../../src/lib/portfolio/locale.ts) |
| **caption**               | `photo.caption` (опц.)                      | authored → legacy                          | authored → computed `«Place, YYYY»`                             | [`resolvePhotoCaption`](../../src/lib/portfolio/locale.ts)     |
| **slug** (`photo.id`)     | `photo.id` (сегмент URL)                    | owner-approved canonical id                | kebab из title; если title не определён → **имя файла** мастера | — (build-time, не резолвится на чтении)                        |
| **alt**                   | `photo.alt` (опц.)                          | authored                                   | явный `alt` → `title` + 1-е предложение `description` → `title` | [`resolvePhotoAlt`](../../src/lib/portfolio/locale.ts)         |
| **description**           | `photo.description` (опц.)                  | authored → legacy                          | нет                                                             | `projectPhotoText`                                             |
| **placeId → место**       | `photo.placeId` (опц.)                      | computed из terms/GPS                      | иерархия мест локализованно                                     | `resolvePlaceHierarchy` (taxonomy)                             |
| **capturedAt → дата**     | `photo.capturedAt` (опц., `YYYY`/`YYYY-MM`) | owner-editorial (`photo-editorial.yaml`)   | человекочитаемо                                                 | [`formatCapturedAt`](../../src/lib/portfolio/captured.ts)      |
| **colorMode/publishedAt** | одноимённые поля                            | authored / activation (ADR-0010)           | —                                                               | —                                                              |
| **unlisted**              | `photo.unlisted` (опц.)                     | computed из legacy `_private` media-folder | —                                                               | фильтры листингов (см. ниже)                                   |

## Развязки подробно

### `slug` ≠ `title`

- **slug** (`photo.id`) — сегмент URL и стабильный идентификатор. Источник — owner-approved canonical
  id decision-контракта; правило авто-генерации: kebab из title, а **при отсутствии title — из имени
  файла** мастера. Не меняется косметически (редиректы — S14).
- **title** — отображаемое имя (поле). Из имени файла **не** создаётся.
- Имя файла — фолбэк **только для slug**, и только когда title не определён.

### `title` ↔ `caption` — приоритет title, не конкуренция

Отображаемое **имя** (`resolvePhotoDisplayName`) — title, иначе caption:

> authored/legacy title → `caption` (authored → computed `«Place, YYYY»`)

- «Приоритет title над caption» = настоящий title бьёт caption. У всех текущих фото title есть,
  поэтому caption-ветка **не задействуется** и рендер не меняется.
- Поле `title` при этом фолбэка не получает — оно либо есть (authored/legacy), либо не определено;
  подставляется именно **caption**, а не «вычисленный title».

### computed `«Place, YYYY»` требует и место, и год

`resolvePhotoCaption`/`computePlaceYear` возвращают `«Place, YYYY»` **только** если есть и `placeId`,
и `capturedAt`. Частичного (только место или только год) не бывает — форма строго `«Place, YYYY»`.
Билингвально: имя места берётся в нужной локали, год числовой, поэтому EN не содержит кириллицы.

## Правила выведения `slug` из title (auto-gen)

Owner-approved правила (согласованы в планировании S12/1b). **Owner-approved canonical id всегда
приоритетнее** этой эвристики — фактические id выбираются редакционно и могут механически отличаться
от title (напр. _The Forgotten Light_ → `divine-light`).

1. **База — английский заголовок.**
2. **Проверка английского**: грамматика + естественный порядок слов; кривое — исправить.
3. **Удалить артикли** (a/an/the) **и служебные связки-предлоги** (in/at/of/on/the…).
4. **Схлопнуть дублирующие атрибуты одной сцены** — оставить сильнейший (напр. `Fog, Sunrise` →
   `sunrise`).
5. **Сохранить имена собственные** (места/объекты): Pienza, Volterra, Belvedere.
6. **Приоритет при сокращении до 2–3 слов:** (1) имя собственное/субъект → (2) главный момент/действие
   → (3) отбросить вторичную атмосферу.
7. **`lowercase`, `kebab-case`, только ASCII `[a-z0-9-]`.**
8. **Уникальность в пределах коллекции**; при коллизии — различающий токен (место/год), не порядковый
   номер.

Отдельная ветка: когда title **не определён**, slug берётся из **имени файла** мастера — это
единственное место, где имя файла участвует; в поле title оно НЕ попадает.

## Карта отображения (где какое поле видно)

| Поверхность                            | Имя (title)                                    | Подпись / место / дата                                  |
| -------------------------------------- | ---------------------------------------------- | ------------------------------------------------------- |
| Страница фото — H1                     | `resolvePhotoDisplayName`                      | —                                                       |
| Страница фото — метаколонка            | —                                              | иерархия места + `formatCapturedAt` (отдельными полями) |
| Страница фото — `<figcaption>`         | —                                              | authored `caption` (у exact-eight пусто → скрыт)        |
| Лайтбокс (PhotoSwipe) — подпись слайда | `resolvePhotoDisplayName`                      | —                                                       |
| Related-карточки                       | `resolvePhotoDisplayName`                      | —                                                       |
| `<title>` / meta                       | `resolvePhotoDisplayName` (`titleSplit.clean`) | —                                                       |
| Грид альбома / футер Recent            | `photo.title` напрямую                         | —                                                       |
| `alt` изображений                      | `resolvePhotoAlt`                              | —                                                       |

Место и дата на странице фото уже показаны **отдельными** метаданными, поэтому computed `«Place,
YYYY»` там был бы дублем — её роль — фолбэк имени (когда нет title) и подпись слайда, а не строка
поверх метаколонки.

## Ось видимости `unlisted`

Ортогональна `draft/published` (см. [ADR-0010](../adr/0010-auto-publish-then-enhance.md)). Выводится
из legacy `_private` media-folder. Unlisted-фото публикуется, встраивается и доступно по прямой ссылке
(его detail-роут и грид членов его альбома работают), но **не перечисляется** в discovery-листингах
(portfolio-грид, список альбомов, Recent/Favorites). Listing-фильтры: `getListableAlbums`/
`getListablePhotos` ([`src/lib/portfolio/publication.ts`](../../src/lib/portfolio/publication.ts)).

## Ещё не реализовано (deferred, план 7 — auto-publish)

- **Схема `title` → optional.** Сейчас `title` обязателен (оба локали non-empty); релаксация нужна,
  когда auto-publish начнёт материализовать фото без authored/legacy title (план 7). Только тогда
  caption-ветка `resolvePhotoDisplayName` и slug-фолбэк на имя файла станут достижимы на реальных
  данных.
- **Slug-фолбэк на имя файла** в авто-генерации (build-time) — вместе с title-optional.
- **Grid/footer через `resolvePhotoDisplayName`.** Гриды и футер читают `photo.title` напрямую (у них
  всегда titled-фото). Провести их через резолвер (нужен `places`) — вместе с релаксацией схемы.
- **`alt`-фолбэк до `«место+год»`** при пустом title (ADR-0010) — тоже с title-optional.
