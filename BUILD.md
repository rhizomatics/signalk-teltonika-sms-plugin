# signalk-teltonika-sms-plugin Development

## Release

```bash
npm login
git tag -f latest
git tag -f v0.5.0
git push --tags
npm publish --tag latest --access public
```

GitHub release

## Run Local CLI

```bash
npm run cli -- login  --router-url https://192.168.1.1 --user <user> --password <password>
npm run cli -- modems --router-url https://192.168.1.1 --user <user> --password <password>
npm run cli -- send "+447123456789" "test" --router-url https://192.168.1.1 --user <user> --password <password> --modem 1-1
npm run cli -- acl <username>
```
