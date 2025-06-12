import {
	ICredentialType,
	INodeProperties,
	ICredentialTestRequest,
} from 'n8n-workflow';

export class ComfyUIApi implements ICredentialType {
	name = 'comfyUIApi';
	displayName = 'ComfyUI API';
	documentationUrl = 'https://github.com/IA-Entertainment-git-organization/n8n-nodes-comfyuinew';
	properties: INodeProperties[] = [
		{
			displayName: 'API URL',
			name: 'apiUrl',
			type: 'string',
			default: 'http://127.0.0.1:8188',
			required: true,
			description: 'The URL of your ComfyUI instance',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: false,
			description: 'API Key if authentication is enabled',
		},
	];

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials?.apiUrl}}',
			url: '/system_stats',
			method: 'GET',
			headers: {
				'Authorization': '={{$credentials?.apiKey ? `Bearer ${$credentials.apiKey}` : undefined}}',
			},
		},
	};
}
