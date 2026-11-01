# signalk-teltonika-sms-plugin Development

## Release

1. Set the version in `package.json` and finish its section in `CHANGELOG.md`:

   ```bash
   npm version <VERSION> --no-git-tag-version
   ```

2. Commit and push, then wait for the SignalK Plugin CI workflow to pass on GitHub.

3. Check what the package will contain:

   ```bash
   npm pack --dry-run
   ```

4. Tag the release. Version tags never move, so only `latest` is forced:

   ```bash
   git tag v<VERSION>
   git tag -f latest
   git push origin v<VERSION>
   git push -f origin latest
   ```

5. Publish to npm:

   ```bash
   npm login
   npm publish --tag latest --access public
   ```

6. Create the GitHub release, with the version's `CHANGELOG.md` section as its notes:

   ```bash
   gh release create v<VERSION> --title v<VERSION> --notes-file <notes.md>
   ```

## Run Local CLI

```bash
npm run cli -- login  --router-url https://192.168.1.1 --user <user> --password <password>
npm run cli -- modems --router-url https://192.168.1.1 --user <user> --password <password>
npm run cli -- send "+447123456789" "test" --router-url https://192.168.1.1 --user <user> --password <password> --modem 1-1
npm run cli -- acl <username>
```
