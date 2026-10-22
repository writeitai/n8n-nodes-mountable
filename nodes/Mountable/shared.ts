import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	ILoadOptionsFunctions,
	INodeListSearchResult,
	INodeProperties,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

export const BASE_URL = 'https://mountable.io/api/v1';

type Context = IExecuteFunctions | IHookFunctions | ILoadOptionsFunctions;

export async function mountableApiRequest(
	this: Context,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
	try {
		return await this.helpers.httpRequestWithAuthentication.call(this, 'mountableApi', {
			method,
			url: `${BASE_URL}${path}`,
			body,
			json: true,
		});
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

// An API key belongs to one organisation: GET /me returns it as api_key.org_id.
export async function getOrgId(this: Context): Promise<string> {
	const me = await mountableApiRequest.call(this, 'GET', '/me');
	const orgId = me?.api_key?.org_id;
	if (!orgId) {
		throw new NodeOperationError(
			this.getNode(),
			'Mountable did not return an organisation for this credential. Use an API key from https://mountable.io/app.',
		);
	}
	return orgId as string;
}

export function filesystemPath(orgId: string, filesystemId: string): string {
	return `/orgs/${orgId}/filesystems/${encodeURIComponent(filesystemId)}`;
}

export async function searchFilesystems(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const orgId = await getOrgId.call(this);
	const filesystems = (await mountableApiRequest.call(
		this,
		'GET',
		`/orgs/${orgId}/filesystems`,
	)) as Array<{ id: string; name: string }>;
	const needle = (filter ?? '').toLowerCase();
	return {
		results: filesystems
			.filter((fs) => fs.name.toLowerCase().includes(needle) || fs.id.includes(needle))
			.map((fs) => ({ name: fs.name, value: fs.id })),
	};
}

export const filesystemLocator: INodeProperties = {
	displayName: 'Filesystem',
	name: 'filesystemId',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	required: true,
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			typeOptions: { searchListMethod: 'searchFilesystems', searchable: true },
		},
		{
			displayName: 'By ID',
			name: 'id',
			type: 'string',
			placeholder: 'e.g. fs_2xq4',
		},
	],
};
