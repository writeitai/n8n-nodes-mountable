import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class MountableApi implements ICredentialType {
	name = 'mountableApi';

	displayName = 'Mountable API';

	icon: Icon = { light: 'file:../icons/mountable.svg', dark: 'file:../icons/mountable.svg' };

	documentationUrl = 'https://mountable.io/docs/workflows';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description: 'Create an API key at https://mountable.io/app',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://mountable.io',
			url: '/api/v1/me',
			method: 'GET',
		},
	};
}
