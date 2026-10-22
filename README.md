# n8n-nodes-mountable

Mountable is a persistent filesystem for AI agents. These n8n nodes create
filesystems, set their limits, hand out one-time mount tickets and start
workflows when files change.

## Install

In n8n, open **Settings → Community Nodes**, choose **Install** and enter
`n8n-nodes-mountable`.

## Credentials

Create an API key at [mountable.io/app](https://mountable.io/app). In n8n,
add a **Mountable API** credential and paste the key. An API key belongs to
one organisation. The nodes work in that organisation.

## Mountable node

- **Account → Who Am I**: the API key, its creator and its organisation.
- **Filesystem → Create**: a new filesystem, with an optional monthly
  spending cap, changes per minute, storage quota and entry quota.
- **Filesystem → Get Many**: the organisation's filesystems.
- **Filesystem → Get Usage**: storage, entries and traffic of a filesystem.
- **Filesystem → Set Limits**: change a filesystem's cap and quotas.
- **Mount Session → Create**: a one-time mount ticket for a sandbox. Send
  the sandbox only the ticket. The API key stays in n8n.
- **Mount Session → Revoke**: end a mount session.
- **Webhook → Create** and **Delete**: manage file-change webhooks yourself.

## Mountable Trigger

Starts the workflow when files change in a filesystem, or in one folder of
it. Activating the workflow creates a Mountable webhook. Deactivating it
deletes the webhook. The trigger checks each message's signature and
refuses messages that Mountable did not sign.

Each item is one message. `files.changed` carries `data.events`, one per
changed path. `files.resync` means: list what you keep track of again.
n8n must be reachable from the internet over https.

## Links

- [Workflow connectors](https://mountable.io/docs/workflows)
- [Webhooks](https://mountable.io/docs/webhooks)

## License

[MIT](LICENSE)
