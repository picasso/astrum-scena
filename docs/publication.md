# Публикация ядра: ранбук владельца

Порядок открытия ядра (история 6.9, [ADR-0016](adr/0016-core-delivery-channel.md)): публичный репо
`astrum-scena` создаётся из одного orphan-коммита итогового дерева рабочего `astrum-scena-zero`,
первая версия пакета публикуется в npm вручную с 2FA, затем настраивается trusted publisher, и
только после этого релизный workflow публикует без `--dry-run`. Все шаги ниже выполняет владелец;
код репо их не делает и ничего не пушит.

Обозначения в командах: `$ZERO` — локальный клон `astrum-scena-zero`, `$PUBLIC` — новый пустой
каталог для публичного репо, `<owner>` — аккаунт GitHub владельца. Первая npm-версия ядра —
`0.6.9`, первый тег публичного репо — `v1.6.9` (версия репо истории 6.9).

## 1. Итоговое дерево в `main` рабочего репо

Владелец, в `$ZERO`:

1. Цели 1–3 истории 6.9 смержены в `main`, CI на `main` зелёный.
2. Версия репо поднята до `1.6.9` (`/ver`), записи `[Unreleased]` перенесены в раздел `[1.6.9]`.
3. `packages/core/package.json` — `"version": "0.6.9"`; в `UPGRADING.md` переходы эпика 6 собраны в
   раздел `[0.6.9]`, а `[Unreleased]` пуст.

```sh
git switch main && git pull --ff-only
git status --porcelain   # пусто: проверяется только закоммиченное дерево
```

**Проверить:** `git log -1` — коммит выпуска 1.6.9; рабочее дерево чистое.

## 2. Локальные проверки

Владелец, в `$ZERO`, с локальным `.identity-denylist` (или `IDENTITY_DENYLIST` в `.env`) и
запущенным Docker:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm demo:packed
pnpm test:e2e:docker
pnpm check:publication-tree
```

`check:publication-tree` клонирует репо во временный каталог (`git clone --no-local`), делает из
`HEAD` единственный orphan-коммит без других ссылок и прогоняет на нём гейт идентичности по списку
владельца и `gitleaks detect` в закреплённом Docker-образе. Отчёт называет только пути, номера
записей списка и правила gitleaks, не сами строки. Без списка или без Docker команда падает с
подсказкой.

**Проверить:** все команды зелёные; `check:publication-tree` напечатал
`check:publication-tree OK — tree <sha дерева>`. Записать `<sha дерева>` — он нужен в шаге 4.

## 3. `CHANGELOG.md` и тексты дерева

Владелец читает глазами то, что станет публичным:

- `CHANGELOG.md`: раздел `[1.6.9]` описывает выпуск; ни одна запись не называет исходный сайт,
  владельца, домены, аккаунты, бакеты или локальные пути (гейт ловит строки из списка, но не смысл).
- `README.md`, `packages/core/README.md`, `UPGRADING.md`, `THIRD_PARTY_NOTICES.md`, `AGENTS.md` —
  то же.

**Проверить:** правок нет; если они понадобились — коммит в `main` и шаги 1–2 заново.

## 4. Orphan-коммит в отдельном клоне

Владелец; рабочий репо не трогается, история `astrum-scena-zero` в публичный репо не попадает:

```sh
git clone --no-local "$ZERO" "$PUBLIC"
cd "$PUBLIC"
git checkout --orphan publication "$(git -C "$ZERO" rev-parse main)"
# публичная идентичность автора и коммитера, например noreply-адрес GitHub
git config user.name "<публичное имя>"
git config user.email "<публичный адрес>"
git commit -m "chore: publish the core repository"
git remote remove origin
git for-each-ref --format='%(refname)' | grep -vx 'refs/heads/publication' | xargs -n1 git update-ref -d
git branch -m publication main
```

Имя и адрес автора и коммитера попадают в метаданные коммита, которые гейты не сканируют, поэтому
они задаются в `$PUBLIC` до `git commit`.

**Проверить:**

```sh
git rev-list --all --count     # 1
git rev-parse HEAD^{tree}      # совпадает с <sha дерева> из шага 2
git for-each-ref               # только refs/heads/main
git log --format='%an <%ae> / %cn <%ce>'   # обе идентичности — публичные
```

## 5. Публичный репо и секрет CI

Владелец, на GitHub:

1. Создать пустой публичный репо `<owner>/astrum-scena` без README, лицензии и `.gitignore`
   (`repository` в `packages/core/package.json` уже указывает на него).
2. Settings → Secrets and variables → Actions: секрет `IDENTITY_DENYLIST` со списком владельца,
   как в `astrum-scena-zero` (в свежем репо секретов нет; без него CI падает на `check:identity`).

**Проверить:** репо пустой; секрет виден в списке секретов репо.

## 6. Первый пуш и тег

Владелец, в `$PUBLIC`:

```sh
git remote add origin git@github.com:<owner>/astrum-scena.git
git push -u origin main
git tag v1.6.9
git push origin v1.6.9
```

**Проверить:** в репо один коммит и тег `v1.6.9`; workflow CI на `main` зелёный, `Release` прошёл с
`--dry-run` (`publish @picasso-ai/astrum-scena@0.6.9 (dry-run)`).

## 7. Первая публикация в npm вручную с 2FA

Владелец, в `$PUBLIC`, под своим аккаунтом npm с 2FA (`npm whoami`):

```sh
pnpm install --frozen-lockfile
pnpm --filter './packages/*' run --if-present build
pnpm --filter './packages/*' pack --pack-destination "$PWD/.cache/release"
pnpm release --dry-run --pack-dir "$PWD/.cache/release"
npm publish "$PWD"/.cache/release/*-astrum-scena-0.6.9.tgz
```

`npm publish` спросит второй фактор; `publishConfig.access: public` уже в пакете. `pnpm release`
без `--dry-run` здесь не годится: он запускает `npm` без терминала, и запрос 2FA не дойдёт.

**Проверить:** `npm view @picasso-ai/astrum-scena@0.6.9 version` печатает `0.6.9`; на странице пакета
npmjs.com — версия `0.6.9` и ссылка на репо.

## 8. Trusted publisher

Владелец, на npmjs.com, в настройках пакета `@picasso-ai/astrum-scena` (нужна 2FA):

1. Trusted Publisher → GitHub Actions: владелец `<owner>`, репо `astrum-scena`, workflow
   `release.yml`, без environment.
2. Включить разрешённое действие «Allow npm publish» (по умолчанию разрешён только
   `npm stage publish`, а workflow публикует прямым `npm publish`).
3. «Publishing access» оставить «require 2FA or granular token with bypass».

**Проверить:** подключение сохранено и висит в статусе «Pending validation» с крайним сроком;
следующая публикация из CI (шаг 10) должна пройти до него.

## 9. Коммит в публичном репо: `--dry-run` снимается с `main`

Владелец, отдельным PR в `<owner>/astrum-scena`, только после шагов 7–8:

- `.github/workflows/release.yml`, шаг `Publish` (`if: github.ref == 'refs/heads/main'`):
  `pnpm release --pack-dir .cache/release` без `--dry-run`; комментарий над шагом о том, что
  `--dry-run` держится до открытия репо, удалить. Шаг `Publish (dry run)` для остальных ссылок не
  меняется.
- `scripts/release.test.ts`: тест `passes a literal --dry-run to every publish step until story 6.9`
  удалить и заменить проверкой «шаг `main` идёт без `--dry-run`, остальные шаги публикации — с ним, и
  других workflow с публикацией нет». Тест `runs the publish with --dry-run whenever the ref is not
main` остаётся.

**Проверить:** CI PR зелёный (`pnpm check` включает `scripts/release.test.ts`); после мержа
`Release` на `main` печатает `skip @picasso-ai/astrum-scena@0.6.9: already published`.

## 10. Первый выпуск из CI и установка без токена

1. Следующий выпуск (подъём `version` ядра в `main`, например выпуск следующей истории) публикуется
   workflow `Release` без токена. **Проверить:** в логе job `release` — `publish …` без `(dry-run)`;
   у версии на npmjs.com есть provenance со ссылкой на коммит публичного репо; trusted publisher больше
   не в «Pending validation».
2. Пробный сайт ставит ядро из npm без токена и без `.npmrc`:

    ```sh
    pnpm add --save-exact @picasso-ai/astrum-scena@0.6.9 astro react react-dom @astrojs/react
    ```

    **Проверить:** установка проходит на машине без входа в npm.

## 11. Архивация `astrum-scena-zero`

Владелец, на GitHub, после шагов 6–9:

1. `astrum-scena-zero` остаётся приватным; Settings → Archive this repository.
2. PR, issues и теги `astrum-scena-zero` в публичный репо не переносятся.
3. Дальнейшая работа — в клоне публичного репо: скопировать в него локальные `.env` и
   `.identity-denylist` (оба в `.gitignore`).

**Проверить:** `astrum-scena-zero` помечен как архив и приватный; в публичном репо по-прежнему один
коммит истории до открытия.
