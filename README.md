# Inventum Site — руководство по развёртыванию (DevOps)

Репозиторий — **статический сайт** (HTML, каталог `assets`). Здесь описан полный цикл: подготовка VPS, пользователь деплоя, GitHub Actions, Nginx, TLS (Let’s Encrypt), DNS (в т.ч. уход с GitHub Pages и REG.RU), типичные ошибки и решения.

**Допущения**

- VPS: **Ubuntu** 22.04/24.04 (или близкая), доступ по SSH под `root` (или админ).
- Веб-сервер: **Nginx**.
- Каталог сайта на сервере: **`/var/www/inventum_site/`** (совпадает с `.github/workflows/deploy.yml`).
- Ветка, от которой запускается деплой: **`main`** (при другой ветке измените workflow).

---

## Содержание

1. [Схема](#1-схема)
2. [Первичная настройка VPS](#2-первичная-настройка-vps)
3. [Пользователь `deploy`](#3-пользователь-deploy)
4. [SSH-ключ для GitHub Actions](#4-ssh-ключ-для-github-actions)
5. [Секреты GitHub](#5-секреты-github)
6. [GitHub Actions](#6-github-actions)
7. [Nginx](#7-nginx)
8. [HTTPS: Certbot (Let’s Encrypt)](#8-https-certbot-lets-encrypt)
9. [DNS: REG.RU и отказ от GitHub Pages](#9-dns-reg-ru-и-отказ-от-github-pages)
10. [Файрвол](#10-файрвол)
11. [Чеклист проверки](#11-чеклист-проверки)
12. [Ошибки и решения](#12-ошибки-и-решения)

---

## 1. Схема

```
Push в main → GitHub Actions → SSH/rsync → /var/www/inventum_site/
                                         → reload Nginx (sudo)
Браузер → DNS (A/AAAA) → VPS :80/:443 → Nginx → статика
```

---

## 2. Первичная настройка VPS

Подключение:

```bash
ssh root@IP_ВАШЕГО_VPS
```

Обновление и установка Nginx и rsync:

```bash
apt update && apt upgrade -y
apt install -y nginx rsync curl dnsutils
systemctl enable nginx
systemctl start nginx
```

Каталог сайта:

```bash
mkdir -p /var/www/inventum_site
```

---

## 3. Пользователь `deploy`

Отдельный пользователь безопаснее, чем деплой под `root`.

Создание:

```bash
adduser deploy
```

Права на каталог:

```bash
chown -R deploy:deploy /var/www/inventum_site
chmod -R u+rwX /var/www/inventum_site
```

Опционально (если Nginx читает файлы как `www-data`):

```bash
chgrp -R www-data /var/www/inventum_site
chmod -R g+rX /var/www/inventum_site
```

### Reload Nginx без пароля для `deploy`

В workflow используется `sudo -n`. Разрешите только эту команду (путь возьмите с сервера):

```bash
which systemctl
```

Обычно `/usr/bin/systemctl`. Тогда:

```bash
echo 'deploy ALL=(root) NOPASSWD:/usr/bin/systemctl reload nginx' > /etc/sudoers.d/deploy-nginx
chmod 440 /etc/sudoers.d/deploy-nginx
visudo -cf /etc/sudoers.d/deploy-nginx
```

Проверка:

```bash
sudo -u deploy sudo -n /usr/bin/systemctl reload nginx
```

---

## 4. SSH-ключ для GitHub Actions

На VPS под `root`:

```bash
ssh-keygen -t ed25519 -f /tmp/github_actions_deploy -N "" -C "github-actions-deploy"
```

Публичный ключ — в `authorized_keys` пользователя `deploy`:

```bash
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
cat /tmp/github_actions_deploy.pub > /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
```

Проверка входа **этим приватным** ключом (должно вывести `deploy`):

```bash
ssh -i /tmp/github_actions_deploy -o IdentitiesOnly=yes deploy@127.0.0.1 "whoami"
```

При первом запросе подтверждения ключа хоста введите `yes`.

Приватный ключ для секрета GitHub:

```bash
cat /tmp/github_actions_deploy
```

Скопируйте вывод **целиком** (включая строки `BEGIN` / `END`) в секрет `VPS_SSH_KEY`.

После успешного CI ключи в `/tmp` можно удалить (секрет в GitHub уже хранит копию приватного ключа):

```bash
shred -u /tmp/github_actions_deploy /tmp/github_actions_deploy.pub 2>/dev/null || rm -f /tmp/github_actions_deploy /tmp/github_actions_deploy.pub
```

**Важно:** в секрет кладётся **приватный** ключ, не файл `.pub`.

---

## 5. Секреты GitHub

Путь: **Settings → Secrets and variables → Actions → New repository secret**.

| Секрет        | Значение |
|---------------|----------|
| `VPS_HOST`    | Публичный IPv4 VPS (или hostname). |
| `VPS_PORT`    | `22`, если SSH на стандартном порту. |
| `VPS_USER`    | `deploy` |
| `VPS_SSH_KEY` | Полный приватный ключ (многострочный). |

Типичные ошибки: в `VPS_SSH_KEY` вставили `.pub`; указали `deploy`, а ключ только у `root`; обрезали ключ при копировании.

---

## 6. GitHub Actions

Файл: `.github/workflows/deploy.yml`.

Кратко:

1. Checkout репозитория.
2. Запись ключа и `~/.ssh/config` с алиасом `vps-deploy` (очистка `\r` у ключа).
3. Шаг **SSH smoke test**.
4. `rsync` в `/var/www/inventum_site/` (исключены `.git`, `.github`).
5. `sudo -n /usr/bin/systemctl reload nginx`.

Запуск: **push в `main`** или **Run workflow** вручную.

На VPS должен быть `rsync`:

```bash
apt install -y rsync
```

Локально:

```bash
git add .github/workflows/deploy.yml
git commit -m "Configure GitHub Actions deploy to VPS"
git push origin main
```

Если основная ветка не `main`, в `deploy.yml` измените:

```yaml
on:
  push:
    branches: ["master"]  # пример
```

---

## 7. Nginx

### 7.1 Ошибка `server_names_hash_bucket_size`

Сообщение:

`could not build server_names_hash, you should increase server_names_hash_bucket_size`

В `/etc/nginx/nginx.conf` внутри блока `http { }` добавьте:

```nginx
server_names_hash_bucket_size 128;
```

При необходимости `256`. Затем:

```bash
nginx -t && systemctl reload nginx
```

### 7.2 Виртуальный хост для домена

Файл, например `/etc/nginx/sites-available/inventum_site`.

Для **инвентум.технологии-исследований.рф** в `server_name` укажите **и кириллицу, и Punycode** (заголовок Host может прийти в любом виде):

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name инвентум.технологии-исследований.рф xn--b1aghscc9ai.xn----8sbfcgdcwabempfxlfbi0dak4e.xn--p1ai;

    root /var/www/inventum_site;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Включение:

```bash
ln -sf /etc/nginx/sites-available/inventum_site /etc/nginx/sites-enabled/inventum_site
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

Punycode можно получить так:

```bash
python3 -c "print('инвентум.технологии-исследований.рф'.encode('idna').decode('ascii'))"
```

---

## 8. HTTPS: Certbot (Let’s Encrypt)

Установка:

```bash
apt install -y certbot python3-certbot-nginx
```

Certbot часто **не принимает кириллицу** в `-d` — используйте **Punycode**:

```bash
certbot --nginx -d xn--b1aghscc9ai.xn----8sbfcgdcwabempfxlfbi0dak4e.xn--p1ai
```

Без интерактива (подставьте email):

```bash
certbot --nginx --non-interactive --agree-tos -m your@email.com \
  -d xn--b1aghscc9ai.xn----8sbfcgdcwabempfxlfbi0dak4e.xn--p1ai
```

Если на шаге email нажали `c`, Certbot отменится — нужен email или флаг `--register-unsafely-without-email` (нежелательно).

После выпуска сертификата:

```bash
nginx -t && systemctl reload nginx
certbot renew --dry-run
```

---

## 9. DNS: REG.RU и отказ от GitHub Pages

### Признак, что всё ещё GitHub

В `nslookup` / `dig`:

- `canonical name = …github.io`
- или IP вида `185.199.108.153` и IPv6 `2606:50c0:…`

### Действия в REG.RU

1. **Личный кабинет → Домены → технологии-исследований.рф → DNS / ресурсные записи.**
2. Для поддомена **инвентум** удалить:
   - **CNAME** на `*.github.io`;
   - лишние **A** на `185.199.*.*`;
   - неверные **AAAA** (чужие IPv6).
3. Добавить **A**: имя **инвентум** → **IPv4 вашего VPS**.

Для одного имени нельзя одновременно **CNAME** и **A** — сначала удалите CNAME.

4. **AAAA** — только если у VPS есть свой IPv6 и Nginx слушает `[::]:80`; иначе не создавайте или удалите старую запись.

### Ожидание обновления DNS

Обычно **5–30 минут**, иногда **1–2 часа**.

Проверка (обратите внимание на полный суффикс **`xn--p1ai`**, не `xn--p1a`):

```bash
dig +short A xn--b1aghscc9ai.xn----8sbfcgdcwabempfxlfbi0dak4e.xn--p1ai
dig +short AAAA xn--b1aghscc9ai.xn----8sbfcgdcwabempfxlfbi0dak4e.xn--p1ai
nslookup инвентум.технологии-исследований.рф
```

Когда **A** указывает только на IP VPS и нет CNAME на GitHub — снова запустите Certbot.

---

## 10. Файрвол

При включённом UFW:

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
ufw status
```

---

## 11. Чеклист проверки

| Шаг | Проверка |
|-----|----------|
| DNS | `dig +short A` по Punycode — IP VPS |
| HTTP | `curl -I -H "Host: …punycode…" http://127.0.0.1/` на сервере |
| Nginx | `nginx -t` |
| HTTPS | браузер по домену |
| CI | зелёный run в GitHub Actions |
| Файлы | `ls -la /var/www/inventum_site` |

---

## 12. Ошибки и решения

### `Permission denied (publickey,password)` в Actions

**Причина:** неверный ключ / пользователь / `authorized_keys`.

**Решение:** ключ в секрете = приватный `id_ed25519`; публичная часть в `/home/deploy/.ssh/authorized_keys`; `VPS_USER=deploy`. Локально: `ssh -i ключ deploy@IP "whoami"`.

### В логе Actions старый скрипт (`echo` вместо `printf`)

**Решение:** запушен не тот коммит или не та ветка — обновите `deploy.yml` в ветке из `on.push.branches`.

### `rsync: Permission denied` / `chgrp failed`

**Причина:** нет прав на `/var/www/inventum_site` или слишком «жирный» `rsync -a`.

**Решение:** `chown -R deploy:deploy /var/www/inventum_site`; в workflow оставить `rsync -rlvz` и `--chmod=…` как в репозитории.

### `sudo: a terminal is required` / `password required` при reload

**Решение:** файл `/etc/sudoers.d/deploy-nginx` с `NOPASSWD` и полным путём к `systemctl` из `which systemctl`.

### Certbot: `Non-ASCII domain names not supported`

**Решение:** `-d` с Punycode (раздел 8).

### Certbot: `unauthorized`, 404 на `/.well-known/acme-challenge/`, IPv6 `2606:50c0:…`

**Причина:** DNS всё ещё ведёт на GitHub или другой хост; лишняя **AAAA**.

**Решение:** исправить DNS в REG.RU (раздел 9), дождаться распространения, повторить Certbot.

### `could not build server_names_hash`

**Решение:** `server_names_hash_bucket_size` в `http {}` (раздел 7.1).

### На Windows нет `ssh`

**Решение:** компонент **OpenSSH Client** в Windows или Git Bash.

### `deploy` не может войти по SSH

**Решение:** проверить `PubkeyAuthentication yes`, при наличии `AllowUsers` — добавить `deploy`; перезапуск `sshd`/`ssh`.

---

## Файлы в репозитории

| Файл | Назначение |
|------|------------|
| `.github/workflows/deploy.yml` | CI/CD: rsync + reload Nginx |
| `index.html`, `assets/` | Контент сайта |

---

## Безопасность

- Не коммитьте приватные ключи.
- При утечке секрета — сменить ключ и обновить `authorized_keys`.
- Предпочтительно деплоить под `deploy`, не под `root`.
- В sudoers — только `reload nginx`, без широких прав.

Если меняете путь деплоя или домен — синхронно обновите **Nginx** (`root`, `server_name`) и **целевой путь в `rsync`** в workflow (либо вынесите путь в отдельный секрет, например `VPS_DEPLOY_PATH`).
