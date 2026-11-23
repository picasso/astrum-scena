# Документация проекта — ядро и миграция исходного сайта

Это рабочая папка с документами по переезду персонального фотосайта с WordPress на Astro.
Проект длительный, поэтому все решения, планы и заметки фиксируются здесь по ходу дела.

Часть более крупной задачи: мигрировать **три** похожих WordPress-сайта. Этот сайт — первый
и одновременно R&D для переиспользуемого подхода (см. ADR-0003).

## Индекс документов

| Документ                                                           | Назначение                                                 |
| ------------------------------------------------------------------ | ---------------------------------------------------------- |
| [02-conventions-and-toolchain.md](02-conventions-and-toolchain.md) | Конвенции, тулчейн, языковое правило, процесс              |
| [04-astro-primer.md](04-astro-primer.md)                           | Вводный курс: что такое Astro (для знающих Next/React)     |
| [07-taxonomy.md](07-taxonomy.md)                                   | S7: категории, альбомы, признаки и динамические срезы      |
| [08-content-model.md](08-content-model.md)                         | S8: коллекции, схемы, связи и безопасный fixture-import    |
| [adr/](adr/README.md)                                              | Журнал архитектурных решений (ADR)                         |
| [backlog/](backlog/README.md)                                      | Отложенные задачи: один файл `bkNN-<slug>.md` на задачу    |
| [blocks/](blocks/README.md)                                        | Контракты контентных блоков для статей и страниц           |
| [more-documents.md](more-documents.md)                             | Автоматическая навигация по связанным материалам           |
| [publication.md](publication.md)                                   | Ранбук владельца: открытие репо ядра и первый выпуск в npm |
| [design/astrum-scena/](design/astrum-scena/README.md)              | Утверждённое имя ядра, знак Astrum Scena и файлы иконок    |

Документы сайта — бриф, аудит, архитектура и роадмап миграции S0–S14, RUNBOOK, `migration/`, `plans/`,
`reference/`, legacy-аудиты и CSS-бюджет из `design/` — в репо сайта.

## Статус

- **Фаза:** миграция завершена (S14 ✅, 2026-09-29): сайт в production на Cloudflare Pages,
  WordPress выведен; отложенное — в [backlog](backlog/README.md)
- **Обновлено:** 2026-09-29
- **Процесс:** средний — docs + ADR + трекинг фаз + гейты code-review/verify + переиспользуемое ядро

## Ключевые решения (зафиксированы)

- **Движок:** Astro (статическая генерация) — [ADR-0001](adr/0001-astro-as-engine.md)
- **Тулчейн/процесс:** адаптирован с других проектов владельца — [02-conventions](02-conventions-and-toolchain.md)
- **Viewer:** PhotoSwipe v5 (перенос с текущего v4)
- **Хостинг + форма:** Cloudflare Pages + Telegram-бот через Pages Function + Turnstile — [ADR-0002](adr/0002-hosting-and-form.md)
- **Деплой:** два трека — сайт (GitHub→CI→Pages), картинки (локаль→R2); мостик `src/generated/images-release.json` со встроенным manifest v3, гейт целостности — [ADR-0004](adr/0004-split-deploy-images-r2.md), [ADR-0014](adr/0014-image-width-ladder.md)
- **Мультисайт:** общее Astro-ядро + playbook + skill `wp-to-astro` — [ADR-0003](adr/0003-shared-core-multisite.md)
- **Хранилища:** мастера на pCloud (не в git), деривативы в R2, код+метаданные в git — [ADR-0004](adr/0004-split-deploy-images-r2.md)
- **Водяной знак:** автоматически через свой `sharp`-пайплайн; мастера остаются чистыми
- **Тулчейн:** TypeScript пиннут на 6.x — [ADR-0005](adr/0005-toolchain-version-pins.md)
- **Интерактив:** без jQuery — native-first (CSS/IntersectionObserver/WAAPI) + Motion One — [ADR-0006](adr/0006-replace-jquery.md)
- **Таксономия:** Portfolio → Series/Places; Recent и Favorites — динамические срезы — [ADR-0007](adr/0007-photo-taxonomy.md)
- **Комментарии:** нет
- **Двуязычность контента:** встроенный i18n Astro (`/en`, `/ru`) вместо двух поддоменов
- **Язык:** доки — русский; код/коммиты/git — английский

## Отложенные решения

- **Монорепо vs отдельные репозитории** для трёх сайтов — решаем после сайта №1
