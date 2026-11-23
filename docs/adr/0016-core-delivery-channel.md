# ADR-0016: Канал поставки пакета ядра

- **Статус:** accepted
- **Дата:** 2026-10-25
- **Связано:** ADR-0003, AD-1, AD-2, AD-8, AD-12, AD-20, AD-22, AD-24, Story 6.1, Story 6.2

## Контекст

Сайт ставит и обновляет ядро как semver-пакет (AD-1); от канала зависят структура репо ядра, релиз и
CI сайта (6.2–6.9). Спайк 6.1 сравнил три канала на учебных пакетах: git-теги с `#semver:`, GitHub
Packages и публичный npm.

Проверка шла на версиях проекта: **pnpm 11.14.0**, **astro 7.1.1**, react 19.2.7, @astrojs/mdx 7.0.3,
@astrojs/react 6.0.1, tailwindcss 4.3.3, Node 24 (локально 24.13.0, в CI 24.21.0).

Учебные репо `<owner>/core-delivery-spike` (пакеты) и `<owner>/core-delivery-spike-site`
(потребитель) жили только на время спайка: после него оба репо и пакеты GitHub Packages удалены,
пакеты npm сняты владельцем с 2FA (наблюдение 5 ниже). Поэтому доказательства ниже — команды и
выдержки логов, а номера прогонов Actions даны для справки.

- Пакеты: `packages/core` (интеграция, `bin`, peer `astro`/`react`/`react-dom`, копия
  `src/lib/variant-css.ts` и четырёх каталогов CSS вариантов) и `packages/migrate-wp` (заглушка с
  `bin`). `bin` и интеграция — собранный `tsc` JS в `dist/`.
- Имена: GitHub Packages требует scope владельца репо — `@<owner>/delivery-spike-*`; в npm scope
  аккаунта — `@picasso-ai/delivery-spike-*`, версии `0.0.x`. Сайт npm-канала ставит пакет под
  алиасом `"@<owner>/delivery-spike-core": "npm:@picasso-ai/delivery-spike-core@^0.0.2"`, и импорты
  сайта не зависят от реестра.
- Сайт-потребитель: по каталогу на канал (`git/`, `github-packages/`, `npm/`), один синтетический
  сайт; CI — матрица из трёх каналов с `permissions: contents: read, packages: read` и только
  `GITHUB_TOKEN`.
- Выпуски: `core` 0.1.0 → 0.2.0 (npm 0.0.1 → 0.0.2), `migrate-wp` остаётся 0.1.0 (npm 0.0.1).

## Решение

Решение владельца после спайка (2026-10-25).

1. **Канал — публичный npm.** Пакеты ядра публикуются из CI репо ядра через trusted publishing:
   без npm-токена в секретах, с provenance (Д9). Сайт ставит и обновляет ядро без аккаунта и
   токена (Д3, Д4), закрепляя версию: до `1.0.0` — точно, затем semver-диапазоном.
2. **Общая версия `core` и `migrate-wp`.** Пока migrate-wp нет (он появляется в эпике 8),
   выпускается только `core`. С появлением migrate-wp оба пакета выпускаются вместе под одним
   номером, как требует AD-20 (гейт падает, если версия migrate-wp расходится с ядром, пока
   миграция не закрыта `migration.closed: true`). Независимые версии не нужны, поэтому строка
   «Независимые версии» матрицы на выбор не влияет.
3. **Приватный период 6.2–6.9 на канал не влияет.** До гейта идентичности ядро извне никто не
   ставит: демо берёт ядро из `pnpm pack` своего репо, пробная сборка 6.8 локальная. Первая
   публикация в npm — после зелёного гейта 6.9.
4. Выбор сделан для публичного ядра на годы: решают установка без токена у каждого сайта и
   проверяемые выпуски из CI. Минусы npm касаются только сопровождающего и закрываются один раз.
5. **Имена пакетов — scope аккаунта `@picasso-ai/`** (проверен в спайке, Д3, Д9):
   `@picasso-ai/astrum-scena` и `@picasso-ai/astrum-scena-migrate-wp`. Переход на организацию npm
   позже — переименование пакета, то есть ломающий выпуск.
6. **Два репо.** С 6.2 до 6.9 ядро живёт в приватном рабочем репо `astrum-scena-zero`; его история
   не публикуется. В 6.9 публичный `astrum-scena` создаётся заново из одного orphan-коммита: GitHub
   хранит коммиты PR в `refs/pull/*` и по SHA, поэтому переписанная история открытого старого репо
   не очищает. Trusted publisher настраивается на публичный репо, и provenance первого выпуска
   указывает на чистый коммит. Перед этим планирование сайта уходит в новый приватный репо сайта.
   Исходный репо замораживается при переходе в `-zero` (последняя версия 1.6.1) и до архива служит
   референсом только на чтение; сайт до 9.3 не обновляется.

## Матрица «канал × критерий»

| Критерий               | git-теги `#semver:`                           | GitHub Packages                                           | публичный npm                                              |
| ---------------------- | --------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| Установка              | да (Д1)                                       | да, только с токеном (Д2)                                 | да, без токена (Д3)                                        |
| Обновление             | да, правкой диапазона в `package.json` (Д4)   | да, `pnpm add …@^0.2.0` (Д4)                              | да; новая версия видна через 1–2 мин (Д4)                  |
| Пакет из подкаталога   | да, `&path:/packages/core` (Д1)               | да, публикация из подкаталога (Д2)                        | да, публикация из подкаталога (Д3)                         |
| Независимые версии     | нет — общие теги; не нужны при AD-20 (Д5)     | да (Д4)                                                   | да (Д4)                                                    |
| Peer `astro`/`react`   | как у всех каналов (Д6)                       | как у всех каналов (Д6)                                   | как у всех каналов (Д6)                                    |
| `bin` из собранного JS | да, если `dist` закоммичен в тег (Д7)         | да (Д7)                                                   | да (Д7)                                                    |
| CI без личного токена  | публичный репо — да; **приватный — нет** (Д8) | публикация и чтение публичного — да; приватный — 403 (Д8) | чтение — да; публикация через trusted publishing — да (Д9) |

### Доказательства

**Д1 — git, установка из подкаталога.** `git/package.json`:
`"@<owner>/delivery-spike-core": "github:<owner>/core-delivery-spike#semver:^0.1.0&path:/packages/core"`
и так же для `migrate-wp`. `pnpm install` → `+ @<owner>/delivery-spike-core 0.1.0`,
`+ @<owner>/delivery-spike-migrate-wp 0.1.0`. Lockfile закрепляет коммит, а не тег:
`version: https://codeload.github.com/<owner>/core-delivery-spike/tar.gz/8eb059f…#path:/packages/core`.
В установленной папке — только поля `files` пакета. CI сайта (прогон 40122610588):
`Lockfile is up to date, resolution step is skipped`, `3 page(s) built`.

**Д2 — GitHub Packages.** Публикация из CI репо пакетов на тег `core-v0.1.0` (прогон 40122373665):
`npm notice Publishing to https://npm.pkg.github.com …`, `+ @<owner>/delivery-spike-core@0.1.0`
с `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` и `permissions: packages: write`. Реестр требует
авторизацию и для публичного пакета: `curl https://npm.pkg.github.com/@<owner>%2Fdelivery-spike-core`
без заголовка → `401`, с токеном → `200`. pnpm 11.14 не подставляет переменные окружения в учётные
данные из `.npmrc` проекта:
`Ignored project-level auth setting "//npm.pkg.github.com/:_authToken" … environment variables are
not expanded in registry credentials that come from a project .npmrc`. В `.npmrc` сайта остаётся
только `@<owner>:registry=https://npm.pkg.github.com`; токен — в пользовательском npmrc (в CI его
пишет `actions/setup-node` с `registry-url` и `scope`, локально — `~/.npmrc` с PAT `read:packages`).

**Д3 — npm.** `npm/package.json` с алиасом `npm:@picasso-ai/delivery-spike-core@^0.0.1` → `+
@<owner>/delivery-spike-core <- @picasso-ai/delivery-spike-core 0.0.1`; токен для чтения не нужен.

**Д4 — обновление одного пакета.** После выпуска `core` 0.2.0 (npm 0.0.2) каждый сайт поднял
только `core`: pnpm печатает `- @<owner>/delivery-spike-core 0.1.0` / `+ … 0.2.0` (npm:
`+ … <- @picasso-ai/delivery-spike-core 0.0.2`). `git diff <канал>/pnpm-lock.yaml`: строк
`migrate-wp` — 0 во всех трёх каналах, строк `core` — 4 (git), 6 (GitHub Packages), 8 (npm). CI
(прогон 40123291442): `@<owner>/delivery-spike-core@0.2.0 cli`, `@<owner>/delivery-spike-migrate-wp@0.1.0
cli`, `React island from core 0.2`. Сразу после `npm publish` npm отвечает
`ERR_PNPM_NO_MATCHING_VERSION`, пока `npm view … versions` не покажет версию (около минуты).

**Д5 — git, независимые версии.** pnpm 11.14 принимает для `#semver:` только теги вида
`v?X.Y.Z` (фильтр `/^refs\/tags\/v?\d+\.\d+\.\d+…/` в git-resolver), поэтому теги общие для всех
пакетов репо:

- `#semver:core-v^0.2.0&path:/packages/core` → `Could not resolve core-v^0.2.0 … Available versions
are: v0.1.0, v0.1.1, v0.2.0`;
- тег `v0.1.1` (выпуск `migrate-wp`) на коммите, где `core` уже 0.2.0: `core#semver:^0.1.0` ставит
  `core` **0.2.0** — диапазон одного пакета выбирается по тегу другого;
- закреплённый тег `#core-v0.2.0&path:/packages/core` ставится, но диапазона нет и `pnpm update
--latest` его не двигает.

Одна последовательность `v`-тегов работает только при общей версии всех пакетов репо, что
противоречит независимым версиям `core` и `migrate-wp`.

**Д6 — peer.** Сайт только с `core` в зависимостях: по умолчанию pnpm 11 (`auto-install-peers:
true`) молча ставит `astro`, `react`, `react-dom` и ничего не сообщает. С
`--config.auto-install-peers=false`: `[WARN] Issues with peer dependencies found`, `pnpm peers
check` → `✕ missing peer astro`, `✕ missing peer react`, `✕ missing peer react-dom`. От канала не
зависит: peer-зависимости разрешает pnpm по манифесту пакета.

**Д7 — `bin`.** `pnpm exec delivery-spike-core` → `@<owner>/delivery-spike-core@0.1.0 cli from
…/node_modules/.pnpm/…/dist/cli.js`, так же `delivery-spike-migrate-wp`, во всех каналах и в CI.
Build-скрипты пакета не запускались: в пакете нет `prepare`, а реестры отдают собранный tarball.
Для git-канала `dist` должен лежать в теговом коммите; релизный workflow проверяет это шагом
`pnpm build && git diff --exit-code`.

**Д8 — приватный репо пакетов.** Репо пакетов временно сделан приватным, CI сайта запущен вручную
(прогоны 40123409615 и 40123668838):

- git: `[ERR_PNPM_FETCH_404] GET https://codeload.github.com/<owner>/core-delivery-spike/tar.gz/adede06…:
Not Found - 404` — `GITHUB_TOKEN` сайта не читает другой приватный репо; нужен секрет (deploy key,
  PAT или токен GitHub App).
- GitHub Packages: пакеты, опубликованные из публичного репо, остались `public` после закрытия репо
  (GitHub не переводит публичный пакет обратно в приватный). Новый пакет
  `@<owner>/delivery-spike-private-probe`, опубликованный из CI закрытого репо, получил видимость
  `private`; CI сайта: `[ERR_PNPM_FETCH_403] GET https://npm.pkg.github.com/@<owner>%2Fdelivery-spike-private-probe:
Forbidden - 403`. Доступ даёт настройка пакета «Manage Actions access» с репо сайта (только в UI,
  без личного токена); в спайке она **не проверялась**.
- npm: приватные пакеты — платный план; публичная публикация до 6.9 открыла бы код ядра до гейта
  идентичности (AD-22).

**Д9 — npm из CI без токена.** Релизный workflow с `permissions: id-token: write` и без
npm-токена публикует оба пакета (прогоны 40123812791 — повтор, и 40183588766, npm 12.2.1):
`POST 201 https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/@picasso-ai/delivery-spike-core`
(в логе разделитель scope и имени закодирован как `%2f`),
`npm verbose oidc Successfully retrieved and set token`, `npm verbose oidc Enabling provenance`,
`Provenance statement published to transparency log`, `+ @picasso-ai/delivery-spike-core@0.0.3`;
так же `+ @picasso-ai/delivery-spike-migrate-wp@0.0.2`. Provenance включается сам, без флага.
Шаг публикации учебного `release.yml` перед `npm publish` проверяет `npm view "$NAME@$VERSION"` и
при найденной версии завершается с `already published`, поэтому повтор прогона безопасен.
Trusted publisher настраивается у каждого пакета отдельно (репо, имя workflow, разрешённые действия)
и до первой публикации через него висит в статусе «Pending validation» с крайним сроком.

Первые попытки (прогоны 40122733346, 40122893978, 40123001637 и исходный 40123812791) получали
OIDC-токен (`GET …/idtoken/…?audience=npm%3Aregistry.npmjs.org 200`), но обмен падал: `POST 404 https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/@picasso-ai/delivery-spike-core`,
`npm verbose oidc Failed token exchange request with body message: OIDC token exchange error - package not found`,
`npm error code ENEEDAUTH`. Причина — подключение trusted publisher не сохранилось: его настройка
прервалась на включение 2FA аккаунта, и у пакетов издателя не было. После повторной настройки
владельцем обмен прошёл. Версию 0.0.2 `core` для проверки обновления опубликовали локально
гранулярным токеном до этого исправления.

Наблюдения владельца на стороне npm:

1. Публикация с аккаунта без 2FA отклоняется (`E403 Two-factor authentication or granular access
token with bypass 2fa enabled is required`), если не использовать гранулярный токен с bypass 2FA;
   npm при этом предупреждает, что такие токены ограничиваются для прямой публикации.
2. Настройка trusted publisher на npmjs.com требует 2FA аккаунта; токеном её не сделать.
3. У trusted publisher теперь есть разрешённые действия: `npm stage publish` (версия ждёт ручного
   подтверждения) разрешён всегда, `npm publish` и `npm dist-tag` включаются флажками.
4. «Publishing access» пакетов оставлен в «require 2FA or granular token with bypass».
5. Снять пакет таким токеном нельзя: `npm unpublish @picasso-ai/delivery-spike-core --force` →
   `E403 … Granular access tokens that bypass two-factor authentication may not perform this
action`; снятие выполняет владелец с 2FA.

## Интеграция из пакета

Сборка `astro build --root <site>` из tarball (`pnpm pack`), установленного в отдельную папку вне
любого workspace, и та же сборка в CI всех трёх каналов (cwd — корень репо сайта, Astro root —
каталог канала).

| Элемент                                    | Результат                                                                                                                                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Маршрут с `getStaticPaths` (`injectRoute`) | работает: `/albums/alpha/`, `/albums/beta/`, `3 page(s) built`                                                                                                                                                           |
| Коллекция через построитель ядра           | работает: `src/content.config.ts` сайта — `export const collections = defineCoreCollections()`; пакет импортирует `astro:content`, `glob({ base: './src/content/albums' })` считается от корня сайта                     |
| MDX-компонент                              | работает: `<Content components={{ Badge }} />`, в HTML `<span class="spike-badge tracking-[0.42em]">core badge</span>`                                                                                                   |
| Виртуальный модуль                         | работает: `virtual:delivery-spike/site` (CSS сайта и `title` из `site.yaml`) и `virtual:variant-css/*`                                                                                                                   |
| CSS с классами через `@source`             | работает: `core.css` пакета — `@import 'tailwindcss'; @source '../components'; @source '../routes';`; в CSS есть `.tracking-\[0\.42em\]` (пакет) и `.tracking-\[0\.11em\]` (сайт). Без `@source` класса пакета в CSS нет |

Ограничения интеграции:

- React-рендерер — зависимость сайта. Если интеграция ядра добавляет `@astrojs/react` из своих
  зависимостей, сборка падает: `Rolldown failed to resolve import "@astrojs/react/server.js" from "
virtual:astro:renderers"` — Astro резолвит рендерер от корня сайта, а pnpm его не поднимает.
  `@astrojs/mdx` из зависимостей ядра работает. В спайке сайт добавил `@astrojs/react` сам; в 6.2
  ядро объявляет его peer-зависимостью рядом с `react`.
- cwd должен содержать каталог вывода. В astro 7.1.1 `getOutDirWithinCwd`
  (`astro/dist/core/build/common.js:76`) уводит серверную сборку статического сайта в
  `<cwd>/.astro`, если `outDir` не лежит под `process.cwd()`; оттуда пререндер не находит
  зависимости сайта: `Cannot find package 'react' imported from <cwd>/.astro/.prerender/chunks/album_….mjs`.
  С cwd — предком корня сайта сборка проходит. Сравнение строковое: если `--root` идёт через симлинк, а
  cwd — реальный путь (системный временный каталог macOS), сбой тот же.
- pnpm 11.14 по умолчанию держит `minimum-release-age: 1440` (24 ч) для реестров (npm и GitHub
  Packages); при `pnpm add`/`install` свежей версии он сам дописывает её в
  `minimumReleaseAgeExclude` в `pnpm-workspace.yaml` сайта (`Added 1 entry to
minimumReleaseAgeExclude …`). Это видно в diff обновления; git-зависимостей не касается.

## Зависимости `variantCssPlugin` от размещения (вход для 6.2)

Копия `src/lib/variant-css.ts` в пакете, сборка из tarball, cwd — родитель корня сайта, `root`
задавался так, как его можно передать в нынешний плагин:

- `root = process.cwd()` (как `astro.config.mjs:102`): `ENOENT: no such file or directory, scandir
'<cwd>/src/content/albums'`;
- `root =` корень сайта: `import "<site>/src/components/top-patterns/carbon.css"` → `Module not found`;
- `root =` корень пакета: `ENOENT … scandir '<site>/node_modules/.pnpm/…/@<owner>/delivery-spike-core/src/content/albums'`;
- два корня — CSS от пакета, альбомы от сайта (обёртка над экспортами `selectVariantCss`,
  `readAlbumLayouts`, `isVariantCssFamily`): сборка проходит, на странице альбома CSS
  `justified`, `masonry`, `title-slide`, `title-strip`, `text-grow`, `carbon` из пакета; раскладка
  `masonry` выбрана по `layout` альбома сайта.

Места смешения корней:

- `src/lib/variant-css.ts:16` — `ALBUMS_DIR = 'src/content/albums'` (ресурс сайта) и
  `:18–23` — `VARIANT_CSS_DIRS` (ресурс пакета) — оба относительны одному неназванному корню.
- `src/lib/variant-css.ts:32–33` — `files()` возвращает пути `src/components/…` без корня;
  `selectVariantCss` отдаёт их наружу, и вызывающий должен угадать корень.
- `src/lib/variant-css.ts:64–65` — `readAlbumLayouts(root)` читает альбомы от переданного корня.
- `src/lib/variant-css.ts:82–85` — `imports(root, …)` резолвит CSS вариантов от того же корня.
- `src/lib/variant-css.ts:88–92` — `everyVariantCss(root)` читает каталоги CSS от того же корня.
- `src/lib/variant-css.ts:107–113` — у `variantCssPlugin` одна опция `root`; `:126–127`
  (`everyVariant`), `:130` (`readAlbumLayouts(options.root)`) и `:132` (`imports(options.root, …)`)
  применяют её к обоим источникам.
- `astro.config.mjs:101–104` — `root: process.cwd()`, `siteConfigFile: path.resolve(siteConfigPath())`
  (от cwd) и `loadSiteConfig(process.cwd())`; умолчания `root = process.cwd()` в
  `src/config/loader.ts:34`, `:50`, `:66`. В интеграции ядра корень сайта — `config.root`, а не cwd.

Не зависят от размещения: `@import '../../styles/layers.css'` (и `'../../../styles/layers.css'` у
`album-layouts`) в первой строке CSS вариантов — путь внутри пакета; работает, пока пакет поставляет
`src/styles/layers.css` рядом.

Исправление 6.2: плагин принимает корень пакета (`fileURLToPath(new URL(…, import.meta.url))`) для
CSS и корень сайта из `config.root` для альбомов и `site.yaml`; `selectVariantCss` возвращает пути
относительно корня пакета явно.

## Ограничения

- Аккаунт npm с 2FA обязателен: без него публикация отклоняется (наблюдение 1), а trusted publisher
  настраивается только с 2FA (наблюдение 2). Снятие версии — тоже только с 2FA (наблюдение 5).
- Trusted publisher привязывается только к существующему пакету: первую версию каждого пакета
  владелец публикует вручную с 2FA (в спайке — 0.0.1), затем настраивает trusted publisher —
  GitHub Actions, владелец и репо ядра, имя релизного workflow, флажок «Allow npm publish».
  Подключение проверяется первой публикацией из CI до крайнего срока «Pending validation»;
  несохранённое подключение даёт `OIDC token exchange error - package not found` (Д9). Следующие
  выпуски идут из CI.
- Неизменяем `name@version`: снятую версию нельзя опубликовать заново. Снять версию можно в течение
  72 часов, если от неё не зависят другие пакеты, а позже — если у пакета нет зависимых пакетов, меньше 300 загрузок за последнюю неделю и
  один владелец ([политика npm](https://docs.npmjs.com/policies/unpublish/)); после снятия всего
  пакета новые версии этого имени блокируются на 24 часа. Снятие не отменяет того, что код уже
  скачали, поэтому выпуск проходит гейт идентичности до публикации.
- pnpm 11.14 по умолчанию держит `minimumReleaseAge` 1440 минут (24 ч); явное обновление на более
  свежую версию (`pnpm add`, правка диапазона и `pnpm install`) дописывает её в
  `minimumReleaseAgeExclude` в `pnpm-workspace.yaml` и ставит её (Д4); diff этого файла — ожидаемая
  часть обновления.
- `@astrojs/react`, `astro`, `react`, `react-dom` — peer-зависимости ядра; сайт объявляет их сам.
  pnpm по умолчанию молча доставляет peer, поэтому шаблон сайта держит их явно в `dependencies`.
- `outDir` сборки лежит под cwd `astro build`: cwd — корень сайта или его предок, а не подкаталог
  вроде `<site>/scripts`. Пути сравниваются как строки, поэтому `--root` через симлинк при cwd в
  реальном пути тоже падает.

## Альтернативы

- **git-теги с `#semver:`** — без реестра, аккаунта и токена, свежая версия доступна сразу; при
  общей версии теги `vX.Y.Z` одного репо работают (Д5). Отвергнуты: собранный `dist` коммитится к
  каждому тегу (Д7), установка скачивает архив всего репо, lockfile закрепляет коммит (Д1), а
  инструменты обновления зависимостей поддерживают git-зависимости хуже реестра.
- **GitHub Packages** — стандартный реестр и публикация с `GITHUB_TOKEN` (Д2). Отвергнуты: чтение
  требует токена даже для публичного пакета, то есть PAT `read:packages` на каждой машине и у каждого
  инструмента каждого сайта навсегда (Д2); пакет, впервые опубликованный публичным, не становится
  приватным (Д8).

## Последствия

- 6.2 создаёт репо ядра с релизным workflow npm (trusted publishing, `id-token: write`; до эпика 8
  выпускается только `core`, затем общая версия с migrate-wp), шаблон сайта без `.npmrc` с
  токенами, и исправляет зависимости `variantCssPlugin` от размещения из списка выше. Релизный
  workflow идемпотентен: перед каждым пакетом он проверяет `npm view <name>@<version>` и пропускает
  уже опубликованный, так что повторный запуск после частичного сбоя дописывает пару (как релизный
  workflow спайка, Д9). Репо 6.2 — приватный `astrum-scena-zero`, пакеты — в scope `@picasso-ai/`.
- Как устроен релиз (6.2): выпуск — подъём `version` публикуемых пакетов в `main`. Workflow
  `.github/workflows/release.yml` запускается push в `main`, на PR в `main` и вручную; собирает пакеты
  `packages/*` и упаковывает их `pnpm pack` (tarball ядра — тот же, что ставит демо в CI: pnpm
  переписывает `workspace:`-зависимости) и вызывает `scripts/release.ts`. Скрипт берёт пакеты `packages/*` без
  `private: true`, требует у них одну версию, npm не ниже 11.5.1 и tarball каждого пакета, проверяет
  `npm view <name>@<version>` у всех пакетов и только затем публикует tarball каждого отсутствующего
  через `npm publish`; `E404` — не опубликован, другой сбой `npm view` — ошибка без публикации.
  Provenance включается сам при OIDC, флаг `--provenance` не передаётся; пакет задаёт
  `publishConfig.access: public`. `id-token: write` есть только у релизного job, прогоны одной ветки
  сериализованы без отмены.
  На PR и на любой ветке, кроме `main`, скрипт всегда идёт с `--dry-run`. До 6.9 `--dry-run` зашит и в
  шаг `main`, а guard-тест `scripts/release.test.ts` в `pnpm check` падает, если какой-либо вызов
  публикации в workflow идёт без него.
- 6.9: после зелёного гейта идентичности публичный `astrum-scena` создаётся из одного коммита,
  владелец публикует первую версию каждого пакета вручную с 2FA, затем настраивает у пакета trusted
  publisher на публичный репо с включённым действием «Allow npm publish» (по умолчанию разрешён только
  `npm stage publish`, наблюдение 3, а workflow вызывает прямой `npm publish`); затем снимает
  `--dry-run` с шага `main` в `release.yml` и guard-тест «каждый вызов публикации с `--dry-run`» —
  следующие выпуски идут из CI. Дерево коммита проверяет `pnpm check:publication-tree` (гейт
  идентичности по списку владельца и gitleaks на orphan-коммите во временном клоне); `--dry-run` и
  guard-тест снимаются отдельным коммитом уже в публичном репо, после ручной публикации и trusted
  publisher, а guard-тест заменяется проверкой «шаг `main` без `--dry-run`, остальные с ним». Порядок
  шагов владельца — ранбук `docs/publication.md`. Первая npm-версия — `0.6.9`: до `1.0.0` версия
  ядра — `0.<эпик>.<история>` выпускающей истории, ломающим может быть любой более высокий выпуск (со
  своим разделом в `UPGRADING.md`), и сайт закрепляет версию точно; первый тег публичного репо —
  `v1.6.9`, версия репо той же истории.
- 6.8 (переиспользуемый CI) не передаёт токенов чтения ядра; гейт одной версии (AD-20) сверяет тег
  workflow и штамп skills с версией ядра из lockfile, а версию migrate-wp — пока миграция не закрыта
  (`migration.closed: true`).
- Смена канала требует правки этого ADR и критериев 6.2/6.8/6.9.
