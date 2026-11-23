# ADR — журнал архитектурных решений

Короткие записи «почему сделали так, а не иначе». Каждое крупное решение фиксируется отдельным
файлом, чтобы контекст не терялся между сессиями и переносился на сайты №2 и №3.

## Формат

`NNNN-краткое-название.md`. Статусы: `proposed` → `accepted` → (`superseded by NNNN`).

## Шаблон

```markdown
# ADR-NNNN: Заголовок

- **Статус:** accepted
- **Дата:** YYYY-MM-DD
- **Контекст:** какую проблему решаем, какие ограничения.
- **Решение:** что выбрали.
- **Альтернативы:** что рассматривали и почему отвергли.
- **Последствия:** плюсы, минусы, на что это влияет дальше.
```

## Реестр

| #                                              | Решение                                         | Статус   |
| ---------------------------------------------- | ----------------------------------------------- | -------- |
| [0001](0001-astro-as-engine.md)                | Astro как движок                                | accepted |
| [0002](0002-hosting-and-form.md)               | Cloudflare Pages + Telegram-форма               | accepted |
| [0003](0003-shared-core-multisite.md)          | Общее Astro-ядро для трёх сайтов                | accepted |
| [0004](0004-split-deploy-images-r2.md)         | Раздельный деплой: сайт через CI, картинки в R2 | accepted |
| [0005](0005-toolchain-version-pins.md)         | Пины версий тулчейна (TypeScript 6.x)           | accepted |
| [0006](0006-replace-jquery.md)                 | Замена jQuery: native-first + Motion One        | accepted |
| [0007](0007-photo-taxonomy.md)                 | Series, Places и динамические фотосрезы         | accepted |
| [0008](0008-layout-container-widths.md)        | Ширины контейнеров: текст 680, галерея 1440     | accepted |
| [0009](0009-alt-caption-derivation.md)         | Alt генерируется, caption опционален            | accepted |
| [0010](0010-auto-publish-then-enhance.md)      | Auto-publish-then-enhance + gate по образам     | accepted |
| [0011](0011-legacy-corpus-errata.md)           | RU-корпус каноничен и правится через errata     | accepted |
| [0012](0012-working-mode-single-source.md)     | После миграции — единый источник, забор снят    | accepted |
| [0013](0013-reference-locale-single-source.md) | Опорная локаль — единый источник Tier-1 полей   | accepted |
| [0014](0014-image-width-ladder.md)             | Единая лестница ширин изображений               | accepted |
| [0015](0015-ci-reuse-policy.md)                | Reuse прогона PR на `main` по дереву merge      | accepted |
| [0016](0016-core-delivery-channel.md)          | Канал поставки ядра: публичный npm              | accepted |
