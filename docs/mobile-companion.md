# Forge Agent Mobile Companion

This fork includes a phone-friendly controller for Forge Agent. Forge Agent still runs on the Windows PC; the phone sends tasks to that desktop process over the same private Wi-Fi/LAN.

## Requirements

- Node.js 18+
- Forge Agent installed in this repository (`npm install`)
- Phone and PC on the same trusted private network
- No extra API key, paid token, or subscription is required by the mobile companion itself

## Start it

From the Forge Agent folder on the PC:

```bash
npm run mobile
```

By default the mobile controller works on the current Forge Agent folder. To point it at another existing project, set `FORGE_MOBILE_DIR` before starting it.

### Windows PowerShell example

```powershell
$env:FORGE_MOBILE_DIR="C:\path\to\Project-Nova-Jarvis"
npm run mobile
```

The terminal prints:

- a 6-digit PIN
- `http://localhost:4173` for the PC
- one or more LAN addresses such as `http://192.168.x.x:4173` for the phone

Open the LAN address on the phone and enter the PIN.

## What the phone can do

- submit a Forge Agent task
- choose DeepSeek or Gemini
- watch the current task output
- see running/completed/failed state
- stop the running child task
- reconnect without retyping the PIN while the browser tab/session is still open

## Security

The server binds to the local network so the phone can reach it. The task API is protected by a random 6-digit PIN generated each time the server starts unless `FORGE_MOBILE_PIN` is explicitly set.

Use it only on a trusted private network. Do not port-forward this server to the public internet. The project directory is fixed on the PC when the server starts; the phone cannot choose arbitrary filesystem paths.

## Optional settings

```powershell
$env:FORGE_MOBILE_PORT="4173"
$env:FORGE_MOBILE_HOST="0.0.0.0"
$env:FORGE_MOBILE_DIR="C:\path\to\project"
npm run mobile
```

If Windows Firewall asks whether Node.js can accept connections, allow it only on Private networks.

## Android home screen

The interface is responsive and can be added to the Android home screen from the browser menu. Because browsers restrict full service-worker/PWA installation on non-HTTPS LAN addresses, the home-screen experience may be a browser shortcut unless the connection is served through HTTPS.
