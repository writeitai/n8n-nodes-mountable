import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes } from 'n8n-workflow';
import {
	BASE_URL,
	filesystemLocator,
	filesystemPath,
	getOrgId,
	mountableApiRequest,
	searchFilesystems,
} from '../Mountable/shared';
import { verifyWebhook } from './verifyWebhook';

export class MountableTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Mountable Trigger',
		name: 'mountableTrigger',
		icon: { light: 'file:../../icons/mountable.svg', dark: 'file:../../icons/mountable.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{"Changes in " + ($parameter["pathPrefix"] || "/")}}',
		description: 'Starts the workflow when files change in a Mountable filesystem',
		defaults: { name: 'Mountable Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'mountableApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName:
					'Use a credential with an API key (mtbl_...): it creates and deletes the webhook. Mountable calls this workflow over https on port 443, so n8n must be reachable from the internet. Each item is one message: files.changed with data.events, or files.resync (list what you keep track of again). Deliveries are at least once: handle each path idempotently.',
				name: 'deliveryNotice',
				type: 'notice',
				default: '',
			},
			filesystemLocator,
			{
				displayName: 'Folder',
				name: 'pathPrefix',
				type: 'string',
				default: '/',
				description:
					'Only changes in this directory and below, for example /tickets. Defaults to / (the whole filesystem).',
			},
		],
	};

	methods = { listSearch: { searchFilesystems } };

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				const filesystemId = this.getNodeParameter('filesystemId', '', {
					extractValue: true,
				}) as string;
				if (!data.webhookId || data.filesystemId !== filesystemId) return false;
				const webhooks = (await mountableApiRequest.call(
					this,
					'GET',
					`${filesystemPath(data.orgId as string, filesystemId)}/webhooks`,
				)) as IDataObject[];
				const url = this.getNodeWebhookUrl('default');
				return webhooks.some((webhook) => webhook.id === data.webhookId && webhook.url === url);
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const filesystemId = this.getNodeParameter('filesystemId', '', {
					extractValue: true,
				}) as string;
				const pathPrefix = this.getNodeParameter('pathPrefix', '') as string;
				const orgId = await getOrgId.call(this);
				const body: IDataObject = { url: this.getNodeWebhookUrl('default') };
				if (pathPrefix) body.path_prefix = pathPrefix;
				const webhook = await mountableApiRequest.call(
					this,
					'POST',
					`${filesystemPath(orgId, filesystemId)}/webhooks`,
					body,
				);
				const data = this.getWorkflowStaticData('node');
				data.webhookId = webhook.id;
				data.secret = webhook.secret;
				data.orgId = orgId;
				data.filesystemId = filesystemId;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				if (data.webhookId) {
					const path = `${filesystemPath(data.orgId as string, data.filesystemId as string)}/webhooks/${encodeURIComponent(data.webhookId as string)}`;
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'mountableApi',
						{
							method: 'DELETE',
							url: `${BASE_URL}${path}`,
							json: true,
							ignoreHttpStatusErrors: true,
							returnFullResponse: true,
						},
					);
					// 404: the webhook or its filesystem is already gone.
					if (response.statusCode >= 400 && response.statusCode !== 404) {
						throw new NodeApiError(this.getNode(), response.body ?? {}, {
							httpCode: String(response.statusCode),
						});
					}
				}
				delete data.webhookId;
				delete data.secret;
				delete data.orgId;
				delete data.filesystemId;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const secret = this.getWorkflowStaticData('node').secret;
		const rawBody = this.getRequestObject().rawBody;
		if (
			typeof secret !== 'string' ||
			!rawBody ||
			!verifyWebhook(secret, this.getHeaderData(), rawBody)
		) {
			this.getResponseObject().status(401).send('Invalid Mountable webhook signature').end();
			return { noWebhookResponse: true };
		}
		return { workflowData: [this.helpers.returnJsonArray(this.getBodyData())] };
	}
}
