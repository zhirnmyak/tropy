# REST API «Тропы без барьеров»

Сервер — `server/api.js`. Тот же набор методов в браузере без сервера реализует `LocalAdapter` (`public/js/api.js`), поэтому интерфейс сайта не зависит от режима работы.

## Общие правила

- Базовый адрес — `/api`, формат — JSON в UTF-8.
- **Аутентификация** — cookie `tropy_sid` (HttpOnly, SameSite=Lax), выдаётся при входе или регистрации. Срок — сутки или 30 дней («Запомнить меня»).
- **Изменяющие запросы** (`POST`, `PUT`, `PATCH`, `DELETE`) должны содержать заголовок `X-Requested-With: fetch` и тело в `application/json`; заголовок `Origin`, если он есть, должен совпадать с адресом сайта. Это защита от CSRF.
- Размер тела запроса — до 256 КБ.
- Ответы API не кешируются (`Cache-Control: no-store`).

### Ошибки

```json
{ "error": { "code": "validation", "message": "Проверьте правильность заполнения формы", "fields": { "email": "Укажите адрес почты" } } }
```

| Код HTTP | `code` | Когда |
|---|---|---|
| 400 | `bad_json`, `limit`, `last_admin`, `self` | некорректный JSON; превышен лимит (50 планов или списков); нельзя удалить или разжаловать последнего администратора или изменить свою роль |
| 401 | `unauthorized`, `bad_credentials` | нужен вход; неверная почта или пароль |
| 403 | `csrf`, `forbidden` | нет `X-Requested-With` или чужой `Origin`; недостаточно прав |
| 404 | `not_found` | нет такого маршрута, плана или метода |
| 405 | `method_not_allowed` | метод не поддерживается для этого адреса |
| 413 | `too_large` | тело запроса больше 256 КБ |
| 415 | `unsupported` | тело не в JSON |
| 422 | `validation` | ошибки в полях — в `fields`, по одной понятной фразе на поле (в том числе «адрес уже зарегистрирован») |
| 429 | `rate_limited` | слишком много попыток; заголовок `Retry-After` — через сколько секунд повторить |

### Ограничение частоты (на IP-адрес)

| Действие | Лимит |
|---|---|
| Вход | 20 попыток за 15 минут |
| Регистрация | 10 в час |
| Смена пароля | 10 в час |
| Отзывы | 30 в час |
| Сообщения о неточностях, обратная связь | по 10 в час |

## Каталог (без входа)

| Метод | Адрес | Описание |
|---|---|---|
| GET | `/api/health` | состояние сервера: `{ ok, mode: "server", version, time, demo }` |
| GET | `/api/routes` | список маршрутов (карточки) с фильтрами, см. ниже |
| GET | `/api/routes/:slug` | маршрут целиком: `{ route, track: { src, pts, prof }, reviews, me }`; `me` — избранное и отметка «пройден» для вошедшего пользователя |
| GET | `/api/routes/:slug/gpx` | трек в формате GPX 1.1 (файл) |
| GET | `/api/restrictions` | база правил посещения; у каждого правила — список маршрутов, к которым оно относится |
| GET | `/api/alerts` | действующие срочные объявления |
| GET | `/api/open-data` | открытые данные каталога с указанием лицензии |

### Фильтры `GET /api/routes`

| Параметр | Значения | Смысл |
|---|---|---|
| `q` | строка до 100 символов | поиск по названию, региону, месту (без учёта регистра и «ё») |
| `need` | `K,O,S,G,U` через запятую | доступно для категорий: К — коляска, О — трудно ходить, С — зрение, Г — слух, У — нужна простая информация |
| `companion` | `1` | учитывать маршруты, доступные **с помощником** |
| `diff` | `1..5` через запятую | сложность |
| `lenMax` | число, км | максимальная длина |
| `days` | `one` / `multi` | однодневные / многодневные |
| `district`, `region` | код | федеральный округ, регион (коды — `public/js/shared/dict.js`) |
| `month` | `1..12` | маршрут в сезоне в этом месяце |
| `land`, `feat` | коды через запятую | ландшафт и особенности |
| `noPermit` | `1` | без пропусков и разрешений, оформляемых заранее |
| `sort` | `access`, `diff-asc`, `diff-desc`, `len-asc`, `len-desc`, `rating`, `name` | сортировка |

```bash
curl 'http://localhost:3000/api/routes?need=K&companion=1&diff=1,2&sort=access'
```

Ответ: `{ "items": [ { "slug", "title", "region", "difficulty", "lengthKm", "access", "rating", "reviewsCount", … } ], "total": 4 }`.

## Аккаунт

| Метод | Адрес | Тело | Описание |
|---|---|---|---|
| POST | `/api/auth/register` | `{ name, email, password, needs?, consent: true }` | регистрация (пароль от 8 символов, буквы и цифры; согласие обязательно) и вход |
| POST | `/api/auth/login` | `{ email, password, remember? }` | вход |
| POST | `/api/auth/logout` | — | выход: сессия удаляется из базы |
| GET | `/api/auth/me` | — | `{ user, favorites, completed }` или `{ user: null }` |
| PATCH | `/api/me` | `{ name, needs?, companion?, settings? }` | профиль: особенности здоровья используются для подбора по умолчанию |
| POST | `/api/me/password` | `{ current, next }` | смена пароля; другие сессии завершаются |
| GET | `/api/me/export` | — | все данные пользователя одним JSON-файлом |
| GET | `/api/me/reviews` | — | мои отзывы |
| DELETE | `/api/me` | `{ password }` | удаление аккаунта со всеми данными |

```bash
# вход и запрос с cookie
curl -c jar.txt -H 'X-Requested-With: fetch' -H 'Content-Type: application/json' \
     -d '{"email":"demo@tropy.local","password":"Demo-2026"}' http://localhost:3000/api/auth/login
curl -b jar.txt http://localhost:3000/api/plans
```

## Личные данные (нужен вход)

| Метод | Адрес | Описание |
|---|---|---|
| PUT / DELETE | `/api/favorites/:slug` | добавить в избранное / убрать |
| PUT / DELETE | `/api/completions/:slug` | отметить маршрут пройденным (`{ date?: "ГГГГ-ММ-ДД" }`, по умолчанию — сегодня) / снять отметку |
| GET / POST | `/api/plans` | мои походы / новый план `{ routeSlug, startDate, endDate, groupSize, needs, contactName, contactPhone, notes, tasks? }` — если `tasks` не переданы, сервер составит список задач подготовки сам |
| GET / PUT / DELETE | `/api/plans/:id` | план (только свой) |
| GET / POST | `/api/gear-lists` | сохранённые списки снаряжения / новый `{ title, routeSlug, params, items }` |
| PUT / DELETE | `/api/gear-lists/:id` | изменить / удалить список |

## Участие

| Метод | Адрес | Тело | Описание |
|---|---|---|---|
| POST | `/api/routes/:slug/reviews` | `{ rating 1–5, accessMatch: yes/partly/no/na, text, needs?, visitedAt? }` | отзыв (один на маршрут, повторная отправка обновляет) |
| DELETE | `/api/reviews/:id` | — | удалить свой отзыв (администратор — любой) |
| POST | `/api/routes/:slug/reports` | `{ category, text, contact? }` | сообщение о неточности в доступности (можно без входа) |
| POST | `/api/feedback` | `{ topic, message, name?, email?, page? }` | обратная связь, в том числе о проблемах доступности сайта |

## Администрирование (роль `admin`)

| Метод | Адрес | Описание |
|---|---|---|
| GET | `/api/admin/stats` | сводка: пользователи, маршруты, отзывы, новые сообщения, популярные маршруты |
| GET / POST | `/api/admin/routes` | все маршруты, включая скрытые / новый маршрут (полная проверка схемой `route`) |
| PUT / PATCH / DELETE | `/api/admin/routes/:slug` | изменить маршрут / сменить статус `published`↔`hidden` / удалить |
| GET / PATCH | `/api/admin/reviews`, `/api/admin/reviews/:id` | модерация отзывов (`{ status }`) |
| GET / PATCH | `/api/admin/reports`, `/api/admin/reports/:id` | сообщения о неточностях: `new → progress → resolved / rejected` и ответ |
| GET / PATCH | `/api/admin/feedback`, `/api/admin/feedback/:id` | обратная связь |
| GET / PATCH | `/api/admin/users`, `/api/admin/users/:id` | пользователи и роли |
| GET / POST / DELETE | `/api/admin/alerts`, `/api/admin/alerts/:id` | срочные объявления (`{ text, level: info/warning, link?, until? }`) |
| GET | `/api/admin/audit` | журнал действий администраторов (последние 200) |

Каждое изменение через админ-методы записывается в `audit_log`: кто, когда, что и над каким объектом.
