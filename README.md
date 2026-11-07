# n8n-nodes-mountable

mountable.io is a persistent filesystem for AI agents. These n8n nodes create
filesystems, set their limits, grant API keys access, hand out one-time mount
tickets and start workflows when files change.

## Install

In n8n, open **Settings → Community Nodes**, choose **Install** and enter
`n8n-nodes-mountable`.

## Credentials

mountable.io has two kinds of key, and each **Mountable API** credential holds
one. Create them at [mountable.io/app](https://mountable.io/app):

- a **management key** (`mtblm_…`, owners and admins create it) creates
  filesystems, sets their limits and grants API keys access;
- an **API key** (`mtbl_…`) creates mount sessions and webhooks and runs the
  trigger.

Both read usage and list filesystems. A key belongs to one organisation; the
nodes work in that organisation.

A filesystem created with a management key has no API key access: run
**Filesystem → Grant API Key Access** with the API key's ID (**Who Am I** with
the API key's credential returns it as `api_key.id`) before the API key mounts
it or watches it.

## Mountable node

- **Account → Who Am I**: the key, its creator and its organisation.
- **Filesystem → Create** (management key): a new filesystem, with an
  optional monthly spending cap, changes per minute, storage quota and entry
  quota.
- **Filesystem → Get Many**: the organisation's filesystems.
- **Filesystem → Get Usage**: storage, entries and traffic of a filesystem.
- **Filesystem → Grant API Key Access** (management key): give an API key
  read-write or read-only access to a filesystem. Webhooks need read-write.
- **Filesystem → Set Limits** (management key): change a filesystem's cap
  and quotas.
- **Mount Session → Create** (API key): a one-time mount ticket for a
  sandbox. Send the sandbox only the ticket. The API key stays in n8n.
- **Mount Session → Revoke** (API key): end a mount session.
- **Webhook → Create** and **Delete** (API key): manage file-change webhooks
  yourself.

## Mountable Trigger

Starts the workflow when files change in a filesystem, or in one folder of
it. It needs a credential with an API key. Activating the workflow creates a mountable.io webhook. Deactivating it
deletes the webhook. The trigger checks each message's signature and
refuses messages that mountable.io did not sign.

Each item is one message. `files.changed` carries `data.events`, one per
changed path. `files.resync` means: list what you keep track of again.
n8n must be reachable from the internet over https.

## Releases

Bump `version` in `package.json` in a pull request, then push the tag
`v<version>`: `.github/workflows/publish.yml` publishes it to npm with
provenance through trusted publishing. The very first publish and the trusted
publisher itself were set up once with `scripts/bootstrap-npm.sh`.

## Links

- [Workflow connectors](https://mountable.io/docs/workflows)
- [Webhooks](https://mountable.io/docs/webhooks)

## License

[MIT](LICENSE)
