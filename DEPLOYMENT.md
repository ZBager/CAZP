# Deployment

Every push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which
verifies the repo and then `rsync`s it onto the server over SSH. There is nothing to build, so a
deploy is just a file copy — typically a couple of seconds.

The workflow does two things:

1. **Verify** — regenerates the agent files and fails if the committed copies are stale, checks
   that all JavaScript parses, and validates `data/events.json`. This runs on every push.
2. **Deploy** — copies the site to the server with `rsync --archive --delete`, then optionally
   smoke-tests the live URL.

The deploy job is skipped (not failed) while `DEPLOY_HOST` is unset, so the repo is safe to push
to before the server exists.

## What gets deployed

Everything except the repo's own scaffolding. `README.md`, `CLAUDE.md`, `DEPLOYMENT.md`,
`tools/`, `.github/` and `.git/` are excluded, leaving exactly the ten files the site serves:

```
index.html  css/styles.css  js/main.js  data/events.json
llms.txt  robots.txt  sitemap.xml
dlc/index.html  dlc/css/styles.css  dlc/js/main.js
```

`--delete` means files removed from the repo are removed from the server too, so the web root is
an exact mirror of `main`. That also makes a wrong `DEPLOY_PATH` destructive, which is why the
workflow refuses empty and top-level paths before running.

---

## One-time setup

### 1. On the server — create a deploy user and the web root

```sh
sudo useradd --create-home --shell /bin/bash deploy

sudo mkdir -p /var/www/cazp
sudo chown -R deploy:www-data /var/www/cazp
sudo chmod -R 755 /var/www/cazp
```

The `deploy` user only needs write access to that one directory — it does not need sudo.

#### Using a different directory, e.g. `/srv/cazp`

Nothing hardcodes `/var/www/cazp` — the location is the `DEPLOY_PATH` variable. To serve from
`/srv/cazp` instead, change it in four places:

```sh
sudo mkdir -p /srv/cazp
sudo chown -R deploy:www-data /srv/cazp
sudo chmod -R 755 /srv/cazp

gh variable set DEPLOY_PATH --body '/srv/cazp'    # step 3 below
```

plus `root /srv/cazp;` in the nginx block, and the path inside `rrsync -wo ...` if you use the
optional hardening. The workflow refuses bare system directories, so `/srv` on its own is
rejected while `/srv/cazp` is accepted.

**If the server runs SELinux (RHEL, Fedora, Rocky, Alma), `/srv` needs one extra step.**
`/var/www` ships pre-labelled as web content; `/srv` does not, so nginx gets a permission error
reading files whose Unix permissions look perfectly correct. Check with `getenforce`, and if it
says `Enforcing`:

```sh
sudo semanage fcontext -a -t httpd_sys_content_t "/srv/cazp(/.*)?"
sudo restorecon -Rv /srv/cazp
ls -Zd /srv/cazp        # should now show httpd_sys_content_t
```

(`semanage` lives in the `policycoreutils-python-utils` package.) Debian and Ubuntu use AppArmor
instead, whose default nginx profile does not restrict document roots, so `/srv` works there
without any of this. Either way `/srv` itself must stay traversable — `chmod 755 /srv` — or the
web server cannot descend into it.

### 2. On your machine — create a deploy key

A dedicated key, with **no passphrase** (GitHub Actions cannot type one):

```sh
ssh-keygen -t ed25519 -C "github-actions-cazp" -f ~/.ssh/cazp_deploy -N ""
```

That writes two files. They go to opposite places:

| File | Contents | Destination |
| --- | --- | --- |
| `~/.ssh/cazp_deploy.pub` | public half, a single line | the **server** |
| `~/.ssh/cazp_deploy` | private half | the **`DEPLOY_SSH_KEY` GitHub secret** |

`authorized_keys` is the list of public keys allowed to log in as a given user — one key per
line, each line optionally prefixed with comma-separated options. Prepare the file first
(`sshd` ignores it entirely if the permissions are too loose):

```sh
# on the server, as a user with sudo
sudo -u deploy mkdir -p /home/deploy/.ssh
sudo -u deploy chmod 700 /home/deploy/.ssh
sudo -u deploy touch /home/deploy/.ssh/authorized_keys
sudo -u deploy chmod 600 /home/deploy/.ssh/authorized_keys
```

Then append the key from your machine. This prepends the literal word `restrict` to the
unchanged contents of the `.pub` file, so there is nothing to copy by hand:

```sh
{ printf 'restrict '; cat ~/.ssh/cazp_deploy.pub; } \
  | ssh YOU@YOUR.SERVER 'sudo -u deploy tee -a /home/deploy/.ssh/authorized_keys'
```

The resulting line looks like this — the `.pub` file's own line, with one word in front:

```
restrict ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAID... github-actions-cazp
```

`restrict` is a deny-by-default switch: no port forwarding, no agent forwarding, no X11, no PTY,
no user rc file. Since the private key sits in GitHub secrets, this limits what a leak is worth.

Be clear about the limit, though: **`restrict` does not prevent arbitrary commands.** It blocks
an interactive shell and tunnelling, but `ssh deploy@host 'some command'` still runs — that is
exactly how rsync works over SSH, so it cannot be blocked without breaking the deploy. To lock
the key down to rsync alone, see [Optional hardening](#optional-hardening) below.

Check it works before involving GitHub:

```sh
rsync -n -av -e "ssh -i ~/.ssh/cazp_deploy" ./index.html deploy@YOUR.SERVER:/var/www/cazp/
```

### 3. Register the credentials with GitHub

Run these from this directory — `gh` is already authenticated as `ZBager`:

```sh
# Secrets — genuinely sensitive
gh secret set DEPLOY_SSH_KEY < ~/.ssh/cazp_deploy
ssh-keyscan YOUR.SERVER | gh secret set DEPLOY_KNOWN_HOSTS

# Variables — not sensitive, and visible in logs makes failures easier to read
gh variable set DEPLOY_HOST --body 'YOUR.SERVER'
gh variable set DEPLOY_USER --body 'deploy'
gh variable set DEPLOY_PATH --body '/var/www/cazp'

# Optional
gh variable set DEPLOY_PORT --body '22'                                  # only if not 22
gh variable set SITE_URL    --body 'https://czyacerixxznalazlprace.pl'   # enables the smoke test
```

`DEPLOY_KNOWN_HOSTS` pins the server's host key, so the workflow uses
`StrictHostKeyChecking=yes` rather than blindly trusting whatever answers on first connection.
If you ever rebuild the server, re-run the `ssh-keyscan` line or deploys will fail with a host
key mismatch — which is the point.

### 4. Deploy

```sh
gh workflow run Deploy      # or just push to main
gh run watch
```

---

## Web server

Skip this if the box already serves the site. Minimal nginx:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name czyacerixxznalazlprace.pl www.czyacerixxznalazlprace.pl;

    root /var/www/cazp;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    # CSS and JS filenames are not fingerprinted, so a long max-age would
    # serve stale assets after a deploy. Revalidate instead.
    location ~* \.(css|js|json|txt|xml)$ {
        add_header Cache-Control "no-cache";
    }
}
```

Then TLS:

```sh
sudo certbot --nginx -d czyacerixxznalazlprace.pl -d www.czyacerixxznalazlprace.pl
```

Two things this site needs that are easy to get wrong:

- **`/data/events.json` must be reachable.** The page fetches it at runtime; if it 404s the
  comparison section falls back to the static summary. The smoke test in the workflow checks it.
- **`/dlc/` needs the trailing slash** to resolve `dlc/css/styles.css` correctly. `try_files
  $uri $uri/` handles the redirect.

---

## Operating it

**Watch a deploy**

```sh
gh run list --workflow=Deploy --limit 5
gh run watch
gh run view --log-failed        # after a failure
```

**Roll back** — deploys mirror `main`, so reverting the commit reverts the site:

```sh
git revert HEAD && git push
```

**Deploy without a code change** (e.g. after fixing a server-side problem):

```sh
gh workflow run Deploy
```

### Troubleshooting

| Symptom | Cause |
| --- | --- |
| Deploy job skipped entirely | `DEPLOY_HOST` variable is unset |
| `Host key verification failed` | `DEPLOY_KNOWN_HOSTS` is stale or missing — re-run `ssh-keyscan` |
| `Permission denied (publickey)` | Public key not in `/home/deploy/.ssh/authorized_keys`, or the file's permissions are not `600` |
| `rsync: failed to set permissions` | `deploy` does not own `DEPLOY_PATH` — re-run the `chown` |
| Deploy succeeds but the site 403s | SELinux label missing on a non-`/var/www` root — see "Using a different directory" above |
| `DEPLOY_PATH ... is a system directory` | You pointed it at `/srv` or `/var` rather than the site's own subdirectory |
| Verify fails on "Generated files are stale" | You edited `data/events.json` without running `node tools/build-agent-files.mjs`; run it and commit |
| Site serves old CSS after a deploy | Browser or CDN cache — see the `Cache-Control` block above |

### Optional hardening

To restrict the deploy key so it can *only* rsync into the web root — not run arbitrary
commands — use `rrsync` (ships with rsync) in the `authorized_keys` line:

```
restrict,command="rrsync -wo /var/www/cazp" ssh-ed25519 AAAA... github-actions-cazp
```

Check where your distro puts it first (`command -v rrsync` or
`/usr/share/rsync/scripts/rrsync`) and use the full path if it is not on `PATH`.
