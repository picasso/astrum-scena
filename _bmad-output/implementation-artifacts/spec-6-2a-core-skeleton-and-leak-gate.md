---
title: 'Каркас репо ядра и гейт утечек'
type: 'chore'
created: '2026-10-26'
status: 'done'
baseline_commit: '7ae8090c6a423b06857f0d4cda3b67515203bd2d'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/docs/adr/0016-core-delivery-channel.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** В `astrum-scena-zero` есть только планирование и инструменты агентов: нет workspace
пакета ядра и демо, нет CI, а гейта утечек нет — любое имя исходного сайта, домен или локальный путь
может попасть в репо, который станет публичным (AD-22).

**Approach:** Часть A истории 6.2 (остальное — части B–G в `deferred-work.md`). Поднять pnpm-workspace
со структурой AD-2, гейт утечек и `check:local-paths` в `pnpm check` и CI, хук `commit-msg`; вычистить
исходный сайт из `AGENTS.md`, правил, skills и конфигов `_bmad`.

## Boundaries & Constraints

**Always:** Ничто созданное в этой части — код, конфиг, README, сообщения коммитов и PR — не называет
исходный сайт, его репо, владельца сайта, домены и локальные пути. GitHub-владелец (URL `github.com/picasso/…`) и scope
`@picasso-ai/` — публичная идентичность автора, разрешены. Гейт по шаблонам (домены, абсолютные пути,
ID аккаунтов и бакетов) живёт в репо; конкретный список строк владельца — только в gitignored-файле
локально и в секрете репо в CI; без списка гейт падает. Каждая проверка — в `pnpm check` или CI.
Версии: Node 24, pnpm 11.14, TypeScript `^6`; `allowBuilds` в `pnpm-workspace.yaml`.

**Решение владельца (планирование):** `docs/` и `_bmad-output/` до 6.9 не сканируются гейтом
утечек — их чистка и разделение — критерий 6.9. `check:local-paths` сканирует весь репо.

**Решения владельца (2026-10-26):** интеграция в этой части — заглушка, добавляющая один маршрут;
перенос кода эпиков 1–5 и разведение корней (AD-8) — часть 6.2a2. Сайтовые skills и агенты
(`import-wp`, `add-album`, `process-images`, `factcheck`, `factcheck-apply`, `translate`,
`fixcontent`, `sync-mdx`, `validate`, `front-audit`, `shared/safety.md`, агенты `factcheck-*`,
`translator`) удаляются из репо ядра: версии под CLI ядра — 6.7, `import-wp` — эпик 8.
Переменная с именем исходного репо переименована в `REFERENCE_SITE_ROOT`; `.env` правит владелец.

**Never:** Не менять исходный репо (только чтение через `*_ROOT`). Не коммитить и не пушить без
явной просьбы; секрет CI создаёт владелец. Не публиковать в npm. Не трогать `CHANGELOG.md` (часть B),
демо-контент и изображения (C), e2e (D), `places.yaml` (E), релизный workflow (F), заморозку (G).

## I/O & Edge-Case Matrix

| Сценарий | Вход / состояние | Ожидаемое | Ошибка |
|---|---|---|---|
| Чистое дерево | список владельца задан | гейт проходит | — |
| Строка владельца в файле | строка из списка в `packages/` | гейт падает | файл, строка, номер шаблона без самой строки |
| Шаблонная утечка | `https://<домен>`, `/Volumes/…`, 32-hex ID | гейт падает | файл и строка |
| Списка нет | нет файла и переменной | гейт падает | сообщение, как задать список |
| Строка владельца в `docs/` | до 6.9 | гейт проходит | — |
| Коммит с AI-атрибуцией или неизвестным scope | `commit-msg` | коммит отклонён | правило из `AGENTS.md` |

</frozen-after-approval>

## Code Map

- `AGENTS.md:6-17,72` — блок `bmad:context` описывает исходный сайт; переписать под ядро, правила
  взаимодействия, коммитов и языка сохранить; типы и scope коммитов — формат, который парсит хук.
- `_bmad/{core,bmm,tea}/config.yaml` — `project_name: <site>` → `astrum-scena`;
  `_bmad/custom/config.toml:9` — комментарий с именем сайта.
- `.claude/skills/<сайтовые>`, `.claude/agents/{factcheck-*,translator}.md`, `.codex/agents/*` —
  удалить вместе с упоминаниями в `.claude/skills/*/` и `.cursor/`; `.agents/skills` — симлинк на
  `.claude/skills`, не трогать.
- `.env.example` — отсутствует, хотя `AGENTS.md` на него ссылается; создать с именами `*_ROOT` и
  переменной списка владельца.
- Источник для переноса (только чтение, `$REFERENCE_SITE_ROOT`): `scripts/check-local-paths.ts`,
  `scripts/lib/local-paths.ts:17-19` (+ тесты) — шаблоны `/Volumes|/Users|/home|/private`;
  `scripts/check-commit-msg.ts` (+ тест), `.husky/commit-msg`; `scripts/check.ts:4-20` — параллельный
  запуск групп `pnpm check`; `package.json` — версии `astro ^7.1.1`, `react ^19.2.7`,
  `@astrojs/react ^6.0.1`, `tailwindcss ^4.3.3`, `vitest ^4.1.10`, `prettier ^3.9.5`.
- ADR-0016:180–208 — установка tarball вне workspace, `astro build --root` с cwd в корне сайта,
  `@astrojs/react` — зависимость сайта, `outDir` под cwd, `minimumReleaseAgeExclude`.
- GitHub: `github.com/picasso/astrum-scena-zero` приватный и пустой, секретов нет.
- Исходный репо стоит на ветке `feat/6-2-core-repo-and-demo-site` с неслитым коммитом заморозки
  `90bdefee524da5c3c95340a1bfa62b846c2b6532` — вход для части G, здесь не трогать.

## Tasks & Acceptance

**Execution:**
- [x] `package.json`, `pnpm-workspace.yaml`, `tsconfig*.json` -- корень workspace: `packages/core`,
  `demo`, места `packages/migrate-wp`, `skills/`, `presets/` (README-заглушки) -- топология AD-2.
- [x] `packages/core` -- `@picasso-ai/astrum-scena`, MIT, peer `astro`/`react`/`react-dom`/`@astrojs/react`,
  сборка `tsc` в `dist/`, `repository` → `astrum-scena`; интеграция-заглушка `injectRoute` одного
  маршрута -- AD-1, канал проверен до переноса кода.
- [x] `demo/` -- синтетический сайт, `astro.config` с одним вызовом интеграции -- AD-1, AD-22.
- [x] `scripts/check-identity.ts` + `scripts/lib/identity.ts` + тесты -- гейт по I/O-матрице -- AD-22.
- [x] `scripts/check-local-paths.ts`, `scripts/check-commit-msg.ts` + тесты, `.husky/commit-msg` --
  перенос с английскими комментариями -- AD-22, правила коммитов.
- [x] `scripts/check.ts` -- `pnpm check`: typecheck, test, format, lint:md, гейты.
- [x] `.github/workflows/ci.yml` -- `pnpm check`; гейт со списком из секрета `IDENTITY_DENYLIST`;
  `pnpm pack` ядра → установка в демо вне workspace → `astro build`; проверка сообщений коммитов PR.
- [x] `AGENTS.md`, `_bmad/*`, сайтовые skills/агенты, `.env.example`, `.gitignore` (файл списка) --
  чистка и удаление по решениям владельца.
- [x] `sprint-status.yaml`, `epics.md` -- 6.2 разделена на части A, A2, B–G.

**Acceptance Criteria:**
- Given чистое дерево и список владельца, when `pnpm check`, then все группы проходят.
- Given CI на PR, when собирается демо, then ядро взято из tarball `pnpm pack`, не из исходников.
- Given строки из списка владельца, when поиск по `AGENTS.md`, `.claude/`, `.codex/`, `.cursor/`,
  `_bmad/`, `packages/`, `demo/`, `scripts/`, then совпадений нет.

## Implementation Notes

- Шаблон доменов: хост любого URL (`https?://`, в том числе JSON-экранированного) вне `PUBLIC_HOSTS`
  в `scripts/lib/identity.ts` — утечка; запись покрывает поддомены, зарезервированные TLD (RFC 2606)
  — все имена под ними. Плейсхолдеры (`<домен>`), шаблоны (`${host}`), IP и однословные хосты
  пропускаются. Список собран по URL в сканируемом дереве (вендорные `bmad-*` skills и тесты).
- Список владельца: переменная `IDENTITY_DENYLIST` (секрет CI) важнее файла `.identity-denylist`;
  заданная пустая переменная — «списка нет», поэтому `IDENTITY_DENYLIST= pnpm check:identity` падает
  и при наличии файла. Сравнение без учёта регистра, `#` — комментарий. Бинарные файлы проверяются
  только по списку владельца (имя в метаданных изображения), без номера строки. Отчёт называет файл,
  строку, колонку и правило, но не совпавший текст.
- `check:local-paths` пропускает компонент-плейсхолдер (`…`, `...`, `<имя>`): иначе гейт падал на
  `/Volumes/…` в замороженной матрице этой спеки, а `docs/` и `_bmad-output/` он сканирует.
- Интеграция-заглушка добавляет `@astrojs/react` через `updateConfig` (peer, резолвится от сайта) и
  `injectRoute('/')` с `.astro` из `routes/` пакета по `import.meta.url`; версия пакета `0.0.0`.
- `pnpm demo:packed` (`scripts/build-demo-from-pack.ts`) — тот же путь локально и в CI: `pnpm pack`
  → копия `demo/` во временный каталог (реальный путь, вне workspace) с `file:`-tarball и секцией
  `allowBuilds` → `pnpm install --no-frozen-lockfile` → `astro build`; проверяет, что пакет
  разрешается внутрь копии, а маршрут ядра есть в `dist`.
- Ключ A2 в `sprint-status.yaml` — `6-2-a2-port-core-code`: грамматика ключей `sprint_plan.py`
  (`N-M[a-z]?-slug`) не принимает `6-2a2-…`. Ключи частей — не заголовки историй в `epics.md`,
  поэтому `sprint_plan.py generate` сочтёт их сиротами.
- Проверка задач по диффу: «Always» требует чистоты и в сообщениях коммитов, а хук и CI проверяли
  только формат. `check-commit-msg` теперь применяет правила `check:identity` к сообщению (хук и
  `--range` в CI с секретом); при утечке выводятся только номер строки и правило, остальные нарушения
  не печатаются, так как цитируют текст. `loadDenylist` и подсказка перенесены в `scripts/lib/identity.ts`.
- Тесты с временными git-репо пишут в системный temp: в песочнице агента `pnpm check` нужно
  запускать без неё.
- После ревью, решение владельца: имя владельца есть только в npm-scope и URL репо GitHub, текст
  его не называет. Строка `!<контекст>` в списке разрешает запись только внутри контекста (маска
  той же длины сохраняет колонки); лицензия — «the Astrum Scena authors», `user_name` в
  `_bmad/*/config.yaml` — `Owner`, личный `_bmad/config.user.toml` выведен из git.

## Spec Change Log

## Review Triage Log

Проход 1 (2026-10-26: blind-hunter B, edge-case-hunter E, verification-gap V).

| # | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|
| B7+E16+V2 | Хук `commit-msg` не читает `.env`, а `check:identity` читает | medium | Список в `.env` проходит `pnpm check`, но каждый коммит падал как «списка нет» | patch |
| V1 | Нет теста, что сообщение с утечкой и другим нарушением не печатает утечку | medium | Склейка нарушений в `messageViolations` прошла бы все тесты и вывела строку владельца в лог CI | patch |
| E15 | Номер строки утечки считается после удаления `#`-строк | low | Номер не совпадал с файлом сообщения; нумерация до фильтра — прямая правка | patch |
| B6 | Содержимое списка владельца нигде не описано; `github.com/<owner>/<repo>` и e-mail проходят шаблоны | low | Покрытие зависит от списка; комментарий в `.env.example` — прямая правка | patch |
| B2 | `sprint-status.yaml` сохранил `project: <site>` | low | Конфиги `_bmad` переименованы, этот файл — нет; однострочная правка | patch |
| B3+E6 | `check:local-paths` пропускает бинарные файлы целиком | medium | Перенесено из исходного репо без изменений; XMP фото может нести путь; бинарники придут с изображениями части C | defer |
| B4+E4+E5 | Бинарники проверяются только списком и только в UTF-8 | low | В сканируемом дереве бинарников нет; XMP — UTF-8 и проверяется списком; UTF-16 и шаблоны в бинарниках — новые ветки | reject |
| B5+E7 | Домен без схемы (e-mail, голый хост, `//host`) не ловится шаблоном | low | Матрица задаёт URL; шаблон голого хоста ловит имена файлов (`index.ts`); конкретные домены — в списке | reject |
| E8 | `https://${sub}.domain` проходит как шаблон | low | Редкая запись; домен ловит список; разбор шаблонов — новая ветка | reject |
| B8 | Сообщения коммитов проверяются только на PR | low | Прямой push в `main` минует CI, но хук работает локально; правильная защита — правило ветки на GitHub | reject |
| B9 | Демо из tarball ставится без lockfile | low | Так ставит зависимости настоящий сайт; lockfile с хешем tarball меняется на каждой сборке; `minimumReleaseAge` pnpm действует по умолчанию | reject |
| B10 | `.astro` и демо не проходят `astro check` | low | Единственный `.astro` компилирует сборка демо; `astro check` придёт с кодом в A2 | reject |
| B11 | Содержимое tarball (publint, exports) не проверяется | low | Публикация — часть F; сборка из tarball уже доказывает, что `dist` и `routes` в пакете | reject |
| B12 | Spec Change Log пуст, хотя объём вырос | false | Исправление — правка спеки этой сборки, такие находки отклоняются; расширение записано в Implementation Notes | reject |
| B13+E18 | Регулярка `allowBuilds` обрывается на пустой строке; нет тестов `prepareSite` | low | Сейчас блок без пустых строк; обрыв роняет установку громко, а не молча; парсер YAML — новая зависимость | reject |
| B14 | При утечке скрыты прочие нарушения сообщения | low | Намеренно: прочие нарушения цитируют текст; после правки утечки хук покажет остальное | reject |
| B1 | `.cursor/rules/code-style.mdc` описывает `src/`, ESLint и токены, которых нет | low | Идентичности в файле нет, правила вернутся с кодом A2; правка контекста агентов — не patch | defer |
| E1+E2 | Цель симлинка не сканируется | low | Единственный симлинк `.agents/skills` указывает внутрь репо; `lstat`/`readlink` — новые ветки | reject |
| E3 | Проиндексированная утечка, исправленная только в рабочем дереве | false | Авторитетный прогон — CI по закоммиченному дереву; локальный `pnpm check` не хук коммита | reject |
| E9+E10 | WSL-путь `/mnt/c/Users` и `/users/` в нижнем регистре | low | Логика перенесена; такие записи маловероятны; расширение шаблона — новая ветка | reject |
| E11+E12+E13+E14 | `Merge …` от человека, повторные «made by», `GPT4o`, `core.commentChar` | low | Логика хука перенесена из исходного репо; обходы требуют намеренных действий | reject |
| E17 | PR от форка или Dependabot без секретов падает | low | Репо приватный, форков нет, Dependabot не настроен | reject |
| E19 | Глобальный virtual store ломает проверку tarball | false | Не включён ни в workspace, ни в копии сайта; при включении проверка падает громко | reject |
| E20+E21 | `check.ts`: повторное использование ID групп, нет SIGHUP | low | Перенесено без изменений; гонка требует переиспользования PID за 5 с | reject |
| E22 | `@astrojs/react` дважды, если сайт сам добавил `react()` | maybe-false | Демо и README так не делают; поведение Astro при двойном рендерере не проверено; интеграция заменяется в A2 | reject |
| E23 | `src/pages/index.astro` сайта конфликтует с маршрутом `/` | low | Заглушка; Astro предупреждает о коллизии; маршруты ядра — A2 и 6.6 | reject |
| E24 | Из `.prettierignore` убраны `*.jsonl` и сгенерированный JSON | low | Таких файлов в репо нет; вернуть с кодом A2 | reject |
| V3 | `check:local-paths` печатает найденный путь в лог | low | Логи приватного рабочего репо не переносятся в публичный; путь нужен для исправления | reject |

Проход 2 (2026-10-26, Codex: blind-hunter CB, edge-case-hunter CE, verification-gap CV) — повторное
ревью другой моделью по диффу `45739cc..ac2e494` без `pnpm-lock.yaml`; исправления — после A3.

| # | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|
| CB1 | В диффе нет `pnpm-lock.yaml`, CI с `--frozen-lockfile` не установится | false | Lockfile исключён из диффа ревью, а не из коммита: `git show --stat ac2e494 -- pnpm-lock.yaml` — 3803 строки | reject |
| CB2+CE6 | `check-commit-msg` не ищет локальные пути | low | `identityViolations` звал только `findLeaks`; сообщение с путём проходило хук и `--range`. Добавлен `findLocalPaths` без печати пути | patch |
| CB3+CE1 | Имена файлов не сканируются, имя с утечкой печатается в отчёте | medium | `check-identity.ts` читал только содержимое; файл `<владелец>.txt` проходил. Имя проверяется списком, в отчёте заменяется на `<file name withheld #N>` | patch |
| CB4+CE2 | Любая ошибка чтения считается удалённым файлом | low | `.catch(() => null)` в обоих гейтах пропускал EACCES. Общий `readScannedFile` пропускает только ENOENT и EISDIR | patch |
| CB5+CE3 | Цель симлинка не сканируется | low | Единственный отслеживаемый симлинк `.agents/skills -> ../.claude/skills` относительный (`git ls-files -s`, режим 120000); `readFile` даёт EISDIR и пропускает; абсолютный симлинк — новая ветка | reject |
| CB6+CE7 | Хук отбрасывает `#`-строки и часть после ножниц, хотя git может их сохранить | low | CI читает сохранённый коммит целиком (`check-commit-msg.ts`, `messageViolations(..., false)` в `--range`); утечка, сохранённая `--cleanup=verbatim`/`whitespace`, падает на PR (тест «finds a leak in a stored # line…») | reject |
| CB7 | `file://localhost/Users/…` обходит шаблон | low | Обычная форма `file:///Users/…` совпадает (перед `/Users` стоит `/`, его нет в lookbehind `[\w.$-]`); в дереве `file://` только `file:///docs/…` в `blocks/links/render.test.ts`; новая альтернатива шаблона — новая ветка | reject |
| CB8 | Части 6.2 в `sprint-status.yaml` без заголовков историй выпадут при генерации | low | Части — решение владельца (`epics.md:983`); генератор не теряет их молча, а сообщает `dropped_orphans` для переноса через `--set` (`bmad-sprint-planning/references/generate-tracking.md:20`) | reject |
| CB9 | Путь peer-рендерера React не проверен | false | Заглушка удалена в A2; собранное демо рендерит React-остров (`astro-island` в `demo/dist/en/contacts/index.html`), сборка из tarball в CI | reject |
| CB10 | Заголовки и описания PR не проверяются гейтом утечек | medium | Always этой части включает PR, а CI проверяет только сообщения коммитов; проверка метаданных PR — новый шаг CI, не прямая правка; решение владельца 2026-10-26 — до 6.9, пока PR не публикуются | defer |
| CE4 | В бинарниках проверяется только список владельца, без доменов и hex-ID | false | Так задумано (запись `deferred-work.md` про XMP): XMP-пакеты несут публичные URL пространств имён (`ns.adobe.com`, `purl.org`), шаблон доменов отметил бы каждый JPEG | reject |
| CE5 | Строка владельца в UTF-16LE в метаданных бинарника | low | XMP в JPEG по спецификации UTF-8; отслеживаемые бинарники — только PNG брейнсторма в `_bmad-output/`, который не сканируется до 6.9 (`UNSCANNED_DIRS`) | reject |
| CE8 | AI-атрибуция в свёрнутой строке трейлера | low | Инструменты пишут трейлер одной строкой (`Co-authored-by: Cursor <…>`); склейка `\n[ \t]+` склеила бы и отступы тела, меняя остальные проверки | reject |
| CV1 | Гейты утечек не проверены на отслеживаемых файлах | medium | Пред-проверено ревьюером: фикстуры только неотслеживаемые; добавлены случаи с `git add` в обоих CLI-тестах | patch |
| CV2 | Загрузка `.env` хуком не проверена | medium | Пред-проверено: тесты задают переменную сами; добавлен запуск `.husky/commit-msg` со списком только в `.env` | patch |
| CV3 | В `--range` не проверены утечки в `#`-строках и после ножниц | medium | Пред-проверено; добавлен тест двух коммитов с утечкой в `#`-строке и после ножниц | patch |

Проход 3 (2026-10-27, Codex: blind-hunter FB, edge-case-hunter FE, verification-gap FV) — ревью
исправлений прохода 2 и правок A2/A3 по диффу `59780c9..4f42a06`.

| # | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|
| FB1+FE1+FV2 | Ошибка чтения файла с утекающим именем печатает настоящий путь в необработанной ошибке Node | medium | `readScannedFile` бросал, `main()` не ловил; ошибка чтения теперь — строка отчёта `<label>: unreadable (<code>)` с тем же скрытым именем; тест с `chmod 000` и именем владельца | patch |
| FB2 | Имена файлов не проверяются доменным и hex-шаблонами | low | Отслеживаемых имён с 32 hex-цифрами — 0 (`git ls-files`); хешированные имена сборок задели бы hex-шаблон; владельца в имени ловит список | reject |
| FB4 | Цели симлинков не сканируются | low | Carried: проход 2 CB5+CE3; единственный симлинк относительный | reject |
| FB6 | Удалённый, но ещё отслеживаемый файл с утекающим именем держит гейт красным до `git rm` | low | Имя проверялось до чтения; теперь файл без `lstat` пропускается целиком; тест | patch |
| FB7 | Подсказка `grep -iF -e <entry>` без кавычек ломается на элементе с пробелом | low | Прямая правка: `-e '<entry>'` | patch |
| FB8 | План проверки PR в `deferred-work.md` не учитывает PR из форков без секретов | low | Репо приватный, форков нет (проход 1 E17); устройство шага — работа 6.9 по той записи | reject |
| FV1 | Скрытие имени в бинарных находках не проверено тестом | medium | Пред-проверено; добавлен тест бинарника с владельцем в имени и содержимом | patch |

## Verification

**Commands:**
- `pnpm install && pnpm check` -- expected: успех.
- `pnpm --filter @picasso-ai/astrum-scena build && pnpm pack` + сборка демо из tarball -- expected: успех.
- `IDENTITY_DENYLIST= pnpm check:identity` -- expected: падение с подсказкой.
