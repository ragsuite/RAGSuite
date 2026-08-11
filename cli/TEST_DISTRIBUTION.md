# Tester guide

```bash
npm install -g @ragsuite/ragsuite@latest
ragsuite init            # or: init --docker
ragsuite start
# native UI :9191 · docker UI :9191 · API :9090
ragsuite logs api
ragsuite stop
ragsuite update --restart
```

Enterprise (optional — vendor email pack):

```bash
ragsuite activate --key ./offline.key --bundle ./ragsuite-ee-0.1.0.encbundle --restart
ragsuite update --bundle ./ragsuite-ee-0.2.0.encbundle --restart
```

Always use **`-g`**. Full guide: [README.md](./README.md).
