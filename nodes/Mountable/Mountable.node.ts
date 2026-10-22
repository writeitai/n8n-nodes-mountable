import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
	INodeType,
	INodeTypeDescription,
	NodeApiError,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import {
	filesystemLocator,
	filesystemPath,
	getOrgId,
	mountableApiRequest,
	searchFilesystems,
} from './shared';

const show = (resource: string, operation: string[]) => ({
	show: { resource: [resource], operation },
});

// The limits a filesystem can have, with the help text for leaving each one out.
const limitFields = (leaveOut: {
	changes: string;
	entries: string;
	cap: string;
	bytes: string;
}): INodeProperties[] => [
	{
		displayName: 'Changes per Minute',
		name: 'mutations_per_minute',
		type: 'number',
		default: 1000,
		typeOptions: { minValue: 1, maxValue: 1000 },
		description: 'Creates, deletes, renames and writes per minute, 1 to 1000. ' + leaveOut.changes,
	},
	{
		displayName: 'Entry Quota',
		name: 'entry_quota',
		type: 'number',
		default: 1000000,
		typeOptions: { minValue: 10000, maxValue: 1000000 },
		description: 'Files, directories and links, 10000 to 1000000. ' + leaveOut.entries,
	},
	{
		displayName: 'Monthly Spending Cap (Cents)',
		name: 'spending_cap_cents',
		type: 'number',
		default: 500,
		typeOptions: { minValue: 0, maxValue: 1000000000 },
		description:
			"This filesystem's usage charges per UTC calendar month, in your organisation's currency: 500 is $5.00 or €5.00. 0 to 1000000000. Needs a saved payment method. " +
			leaveOut.cap,
	},
	{
		displayName: 'Storage Quota (Bytes)',
		name: 'byte_quota',
		type: 'number',
		default: 107374182400,
		typeOptions: { minValue: 1073741824, maxValue: 107374182400 },
		description: '1073741824 (1 GiB) to 107374182400 (100 GiB). ' + leaveOut.bytes,
	},
];

export class Mountable implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Mountable',
		name: 'mountable',
		icon: { light: 'file:../../icons/mountable.svg', dark: 'file:../../icons/mountable.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Create Mountable filesystems, set their limits and usage, mint one-time mount tickets and manage file-change webhooks',
		defaults: { name: 'Mountable' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'mountableApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Account', value: 'account' },
					{ name: 'Filesystem', value: 'filesystem' },
					{ name: 'Mount Session', value: 'mountSession' },
					{ name: 'Webhook', value: 'webhook' },
				],
				default: 'filesystem',
			},

			// Account
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['account'] } },
				options: [
					{
						name: 'Who Am I',
						value: 'whoAmI',
						description: "The API key's creator, the key and its organisation",
						action: 'Get the API key and its organisation',
					},
				],
				default: 'whoAmI',
			},

			// Filesystem
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['filesystem'] } },
				options: [
					{ name: 'Create', value: 'create', action: 'Create a filesystem' },
					{ name: 'Get Many', value: 'getAll', action: 'Get many filesystems' },
					{ name: 'Get Usage', value: 'getUsage', action: 'Get the usage of a filesystem' },
					{ name: 'Set Limits', value: 'setLimits', action: 'Set the limits of a filesystem' },
				],
				default: 'create',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				required: true,
				default: '',
				displayOptions: show('filesystem', ['create']),
				description:
					'1 to 200 characters. Names need not be unique. This call is not idempotent: after a timeout, list filesystems and look for the name before creating again.',
			},
			{
				displayName: 'Limits',
				name: 'limits',
				type: 'collection',
				placeholder: 'Add Limit',
				default: {},
				displayOptions: show('filesystem', ['create']),
				options: limitFields({
					changes: "Leave out for the platform's 1000.",
					entries: 'Leave out for the default, 1000000.',
					cap: 'Leave out for no cap.',
					bytes: 'Leave out for the default, 100 GiB.',
				}),
			},
			{
				...filesystemLocator,
				displayOptions: show('filesystem', ['getUsage', 'setLimits']),
			},
			{
				displayName: 'Limits',
				name: 'limits',
				type: 'collection',
				placeholder: 'Add Limit',
				default: {},
				displayOptions: show('filesystem', ['setLimits']),
				options: limitFields({
					changes: 'Leave out to keep the current rate.',
					entries: 'Leave out to keep the current quota.',
					cap: 'Leave out to keep the current cap.',
					bytes: 'Leave out to keep the current quota.',
				}),
			},
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				displayOptions: show('filesystem', ['getAll']),
				description: 'Whether to return all results or only up to a given limit',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				default: 50,
				typeOptions: { minValue: 1 },
				displayOptions: {
					show: { resource: ['filesystem'], operation: ['getAll'], returnAll: [false] },
				},
				description: 'Max number of results to return',
			},

			// Mount session
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['mountSession'] } },
				options: [
					{ name: 'Create', value: 'create', action: 'Create a mount session' },
					{ name: 'Revoke', value: 'revoke', action: 'Revoke a mount session' },
				],
				default: 'create',
			},
			{
				displayName:
					'Send the sandbox only the one-time ticket from the output. The API key stays in this n8n credential and never goes to the sandbox.',
				name: 'ticketNotice',
				type: 'notice',
				default: '',
				displayOptions: show('mountSession', ['create']),
			},
			{
				...filesystemLocator,
				displayOptions: show('mountSession', ['create']),
			},
			{
				displayName: 'Mode',
				name: 'mode',
				type: 'options',
				required: true,
				options: [
					{ name: 'Read-Write', value: 'rw' },
					{ name: 'Read-Only', value: 'ro' },
				],
				default: 'rw',
				displayOptions: show('mountSession', ['create']),
			},
			{
				displayName: 'Idempotency Key',
				name: 'idempotencyKey',
				type: 'string',
				required: true,
				default: '',
				displayOptions: show('mountSession', ['create']),
				description:
					'A new key for each mount. Reuse it only to retry this create. A replay returns the existing session with a null ticket.',
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: show('mountSession', ['create']),
				options: [
					{
						displayName: 'Max Duration (Seconds)',
						name: 'max_duration_seconds',
						type: 'number',
						default: 3600,
						typeOptions: { minValue: 60, maxValue: 604800 },
						description:
							'The templates send 3600. The API allows 60 to 604800 and defaults to 43200 when left out.',
					},
				],
			},
			{
				displayName: 'Session ID',
				name: 'sessionId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: show('mountSession', ['revoke']),
			},

			// Webhook
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['webhook'] } },
				options: [
					{
						name: 'Create',
						value: 'create',
						description: 'The output holds the webhook secret (whsec_...), returned once',
						action: 'Create a webhook',
					},
					{ name: 'Delete', value: 'delete', action: 'Delete a webhook' },
				],
				default: 'create',
			},
			{
				...filesystemLocator,
				displayOptions: show('webhook', ['create', 'delete']),
			},
			{
				displayName: 'URL',
				name: 'url',
				type: 'string',
				required: true,
				default: '',
				displayOptions: show('webhook', ['create']),
				description:
					'An https URL on port 443, reachable from the internet. To start a workflow when files change, use the Mountable Trigger node instead.',
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: show('webhook', ['create']),
				options: [
					{
						displayName: 'Folder',
						name: 'path_prefix',
						type: 'string',
						default: '/',
						description:
							'Only changes in this directory and below, for example /tickets. Defaults to / (the whole filesystem).',
					},
				],
			},
			{
				displayName: 'Webhook ID',
				name: 'webhookId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: show('webhook', ['delete']),
			},
		],
	};

	methods = { listSearch: { searchFilesystems } };

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		let orgId: string | undefined;
		const org = async () => (orgId ??= await getOrgId.call(this));

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const filesystemId = () =>
					this.getNodeParameter('filesystemId', i, '', { extractValue: true }) as string;
				let result: IDataObject | IDataObject[];

				if (resource === 'account') {
					result = await mountableApiRequest.call(this, 'GET', '/me');
				} else if (resource === 'filesystem' && operation === 'create') {
					result = await mountableApiRequest.call(
						this,
						'POST',
						`/orgs/${await org()}/filesystems`,
						{
							name: this.getNodeParameter('name', i) as string,
							...(this.getNodeParameter('limits', i, {}) as IDataObject),
						},
					);
				} else if (resource === 'filesystem' && operation === 'getAll') {
					const all = (await mountableApiRequest.call(
						this,
						'GET',
						`/orgs/${await org()}/filesystems`,
					)) as IDataObject[];
					const returnAll = this.getNodeParameter('returnAll', i) as boolean;
					result = returnAll ? all : all.slice(0, this.getNodeParameter('limit', i) as number);
				} else if (resource === 'filesystem' && operation === 'getUsage') {
					result = await mountableApiRequest.call(
						this,
						'GET',
						`${filesystemPath(await org(), filesystemId())}/usage`,
					);
				} else if (resource === 'filesystem' && operation === 'setLimits') {
					result = await mountableApiRequest.call(
						this,
						'PATCH',
						filesystemPath(await org(), filesystemId()),
						this.getNodeParameter('limits', i, {}) as IDataObject,
					);
				} else if (resource === 'mountSession' && operation === 'create') {
					result = await mountableApiRequest.call(this, 'POST', '/mount-sessions', {
						filesystem_id: filesystemId(),
						mode: this.getNodeParameter('mode', i) as string,
						idempotency_key: this.getNodeParameter('idempotencyKey', i) as string,
						...(this.getNodeParameter('additionalFields', i, {}) as IDataObject),
					});
				} else if (resource === 'mountSession' && operation === 'revoke') {
					const sessionId = this.getNodeParameter('sessionId', i) as string;
					await mountableApiRequest.call(
						this,
						'DELETE',
						`/mount-sessions/${encodeURIComponent(sessionId)}`,
					);
					result = { id: sessionId, revoked: true };
				} else if (resource === 'webhook' && operation === 'create') {
					result = await mountableApiRequest.call(
						this,
						'POST',
						`${filesystemPath(await org(), filesystemId())}/webhooks`,
						{
							url: this.getNodeParameter('url', i) as string,
							...(this.getNodeParameter('additionalFields', i, {}) as IDataObject),
						},
					);
				} else {
					const webhookId = this.getNodeParameter('webhookId', i) as string;
					await mountableApiRequest.call(
						this,
						'DELETE',
						`${filesystemPath(await org(), filesystemId())}/webhooks/${encodeURIComponent(webhookId)}`,
					);
					result = { id: webhookId, deleted: true };
				}

				returnData.push(
					...this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(result), {
						itemData: { item: i },
					}),
				);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				const nodeError = error as NodeApiError;
				throw new NodeOperationError(this.getNode(), nodeError, {
					itemIndex: i,
					description: nodeError.description ?? undefined,
				});
			}
		}

		return [returnData];
	}
}
