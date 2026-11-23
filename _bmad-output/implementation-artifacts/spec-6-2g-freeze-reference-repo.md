---
title: 'Story 6.2, часть G — заморозка исходного репо'
type: 'chore'
created: '2026-11-01'
status: 'done'
baseline_commit: '4755e8649d1c24eb18c65daec1838a6457f5cfa8'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/adr/0016-core-delivery-channel.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Критерии 6.2 требуют, чтобы исходный репо был заморожен финальным коммитом с решениями 6.2
(последняя версия 1.6.1), а правило «код меняется только в ядре; исходный репо не меняется до архива в
9.4» стояло в `AGENTS.md` обоих репо. Коммит заморозки в исходном репо уже есть (26.10, ветка
`feat/6-2-core-repo-and-demo-site`, раздел «Frozen repo» в его `AGENTS.md`), но в `main` не влит. В
`AGENTS.md` этого репо сказано только «read-only… never modify it», без «код только в ядре» и без срока.

**Approach:** Здесь — дописать правило в `AGENTS.md` и закрыть часть G в статусах. В исходном репо этот
агент ничего не пишет: влить ветку заморозки — шаг владельца, его способ задан решением ниже.

**Decision (владелец, 2026-11-02):** ветка заморозки вливается в `main` исходного репо через PR,
merge-коммит несёт `[skip ci]` в сообщении: CI PR проходит как обычно (без deploy), workflow на push в
`main` не стартует, production не передеплоивается. PR и слияние делает владелец.

## Boundaries & Constraints

**Always:** исходный репо и `$REFERENCE_SITE_ROOT` — только чтение (git-команды на чтение, без
checkout, fetch с записью, commit, push); текст в этом репо не называет исходный репо, его владельца,
домены и пути (AD-22) — только «reference site» и `$REFERENCE_SITE_ROOT`; `pnpm check` зелёный.

**Never:** правка ветки заморозки или новый коммит в исходном репо; архивирование репо (это 9.4);
запись SHA исходного репо в файлы этого репо; правка `CHANGELOG.md` (правило для агентов, не поведение
пакета).

</frozen-after-approval>

## Code Map

- `AGENTS.md:26-27` -- абзац «The core is extracted from a reference site kept read-only at
  `$REFERENCE_SITE_ROOT`…; never modify it» — сюда правило: код меняется только в ядре, исходный репо
  не меняется до архива в 9.4 (после 9.3 в production).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `6-2g-freeze-reference-repo: backlog`;
  остальные части 6.2 уже `review`, родитель `6-2-core-repo-and-demo-site: in-progress`.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- запись «Story 6.2, часть G»
  (`source_spec: none`) — дописать `closed_by`.
- `docs/adr/0016-core-delivery-channel.md` п. 6 -- заморозка уже описана («последняя версия 1.6.1…
  референсом только на чтение»); не менять.
- `_bmad-output/planning-artifacts/epics.md` (6.2, критерии заморозки и правила) -- текст критериев
  верен, не менять.
- Исходный репо (только чтение): `origin/main` = merge PR #65 (6.1, версия 1.6.1, тег `v1.6.1`); ветка
  `feat/6-2-core-repo-and-demo-site` на origin — два коммита сверх `main`: логотип ядра и `90bdefe`
  «freeze the repo…» (`AGENTS.md` «Frozen repo», ADR-0016 п. 5–6, spine, `epics.md`).

## Tasks & Acceptance

**Execution:**
- [x] `AGENTS.md` -- дописать в абзац о reference site: код меняется только в ядре; reference site
  заморожен на 1.6.1 и не меняется до архива в 9.4; ядро читает его только для проверок на реальном
  конфиге и пробной сборки -- правило «обоих репо» из критерия 6.2
- [x] `sprint-status.yaml` -- `6-2g-freeze-reference-repo` → `review`, родитель 6.2 → `review` (все
  части в `review`) -- закрытие части
- [x] `deferred-work.md` -- `closed_by: spec-6-2g-freeze-reference-repo.md` у записи части G

**Acceptance Criteria:**
- [x] `AGENTS.md` этого репо содержит правило «код только в ядре, reference site не меняется до архива
  в 9.4» и не называет исходный репо (`pnpm check:identity` зелёный).
- [x] Шаг владельца в исходном репо (PR ветки заморозки, merge-коммит с `[skip ci]`) записан в
  Implementation Notes.
- [x] `pnpm check` зелёный.

## Implementation Notes

Шаг владельца в исходном репо (агент там ничего не пишет): открыть PR ветки `feat/6-2-core-repo-and-demo-site`
в `main`, слить merge-коммитом с `[skip ci]` в сообщении — CI PR проходит как обычно, workflow на push в
`main` не стартует, production не передеплоивается. До слияния заморозку держат правила в `AGENTS.md`
обоих репо.

## Spec Change Log

## Review Triage Log

Первый проход (Codex: blind, edge-case, verification-gap; verification-gap — без находок). Диф включает
пересобранный `epic-6-context.md` (кеш был старше `epics.md`).

| # | Слой | Находка | Вердикт | Обоснование | Маршрут |
|---|---|---|---|---|---|
| 1 | blind | `closed_by` ссылается на спеку, которой нет в дифе | false | Спека не отслеживается git и по правилу шага ревью не входит в диф (её читает только edge-слой); файл лежит рядом с `deferred-work.md` | reject |
| 2 | blind, edge | `epic-6-context.md:13`: «частями A–E» без F и G | low | `epics.md:1023` перечисляет части до G; прямая правка | patch |
| 3 | blind, edge | `epic-6-context.md:39`: нумерация `1.<epic>.<story>` смешана с версией npm-пакета | low | Строка следует `epics.md:1104` и spine:150 («ядро продолжает нумерацию 1.6.x»), но `AGENTS.md` (`/ver`) держит npm-версию отдельно (0.x до первого сайта); уточнение одной фразы | patch |
| 4 | blind | выпало: публичный репо из одного orphan-коммита | false | Критерий истории 6.9 в `epics.md`; рецепт `compile-epic-context.md` («No story-level details», 800–1500 токенов) исключает детали историй — их спеки читают критерии истории | reject |
| 5 | blind | выпало: перенос планирования сайта в приватный репо до 6.9 | false | Критерий 6.9 и ADR-0016 п. 6; то же правило рецепта (детали историй — в `epics.md`) | reject |
| 6 | blind | выпало: пробная сборка на референсе (6.8 → 6.9) | false | Строка 58 контекста сохраняет требование чистоты предыдущих историй к 6.9; детали 6.8 — критерий истории, рецепт их исключает | reject |
| 7 | blind | выпали dry-run до 6.9 и ручной первый выпуск с 2FA | false | Это критерии 6.2/6.9 в `epics.md` и ADR-0016 «Последствия»; dry-run держит guard-тест `scripts/release.test.ts` в `pnpm check` | reject |
| 8 | blind | выпали деплой только из `main`, запрет записи в R2, сериализация, сверка SHA | false | Критерии истории 6.8 в `epics.md`; рецепт исключает детали историй | reject |
| 9 | blind | выпала установка демо вне workspace без секретов | false | Это уже код (`scripts/build-demo-from-pack.ts`, CI) и `AGENTS.md` «Running and verifying»; рецепт: «Nothing derivable from the codebase» | reject |
| 10 | blind | выпала e2e-проверка поведения замены (клавиатура, ClientRouter) | false | Критерий истории 6.5 в `epics.md`; рецепт исключает детали историй | reject |
| 11 | blind | выпала ошибка сборки на контенте выключенного модуля | false | Критерий истории 6.6 в `epics.md`; рецепт исключает детали историй | reject |
| 12 | blind | выпал отказ на отсутствующую или неподдерживаемую `schemaVersion` | false | Критерий истории 6.3 в `epics.md`; рецепт исключает детали историй | reject |

## Design Notes

Решения 6.2, принятые после 26.10 (части A–F), в исходный репо не дописываются: с переходом в этот
репо планирование живёт здесь, а `AGENTS.md` исходного репо уже отсылает к ядру. «Финальный коммит с
решениями 6.2» — коммит перехода `90bdefe`.

Автоматической проверки «исходный репо не меняется» в `pnpm check` нет и быть не может: CI этого репо
исходный репо не видит, веточная защита в нём недоступна (приватный репо без Pro). До архива в 9.4
заморозку держит правило в `AGENTS.md` обоих репо; это известный пробел, не находка ревью.

## Verification

**Commands:**
- `pnpm check` -- expected: зелёный, `check:identity` и `check:local-paths` без нарушений
