import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { Jimp } from 'jimp';

export class Comfyui implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ComfyUI',
		name: 'comfyui',
		icon: 'file:comfyui.svg',
		group: ['transform'],
		version: 1,
		description: 'Execute ComfyUI workflows',
		defaults: {
			name: 'ComfyUI',
		},
		credentials: [
			{
				name: 'comfyUIApi',
				required: true,
			},
		],
		inputs: `={{ $string }}`,
		outputs: `={{ $string }}`,
		properties: [
			{
				displayName: 'Workflow JSON',
				name: 'workflow',
				type: 'string',
				typeOptions: {
					rows: 10,
				},
				default: '',
				required: true,
				description: 'The ComfyUI workflow in JSON format',
			},
			{
				displayName: 'Output Format',
				name: 'outputFormat',
				type: 'options',
				options: [
					{
						name: 'JPEG',
						value: 'jpeg',
					},
					{
						name: 'PNG',
						value: 'png',
					},
					{
						name: 'VIDEO',
						value: 'mp4',
					}
				],
				default: 'jpeg',
				description: 'The format of the output images',
			},
			{
				displayName: 'JPEG Quality',
				name: 'jpegQuality',
				type: 'number',
				typeOptions: {
					minValue: 1,
					maxValue: 100
				},
				default: 80,
				description: 'Quality of JPEG output (1-100)',
				displayOptions: {
					show: {
						outputFormat: ['jpeg'],
					},
				},
			},
			{
				displayName: 'Timeout',
				name: 'timeout',
				type: 'number',
				default: 30,
				description: 'Maximum time in minutes to wait for workflow completion',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const credentials = await this.getCredentials('comfyUIApi');
		const workflow = this.getNodeParameter('workflow', 0) as string;
		const timeout = this.getNodeParameter('timeout', 0) as number;
		const outputFormat = this.getNodeParameter('outputFormat', 0) as string;
		let jpegQuality: number
		if (outputFormat === 'jpeg') {
			jpegQuality = this.getNodeParameter('jpegQuality', 0) as number;
		}

		const apiUrl = credentials.apiUrl as string;
		const apiKey = credentials.apiKey as string;

		console.log('[ComfyUI] Executing with API URL:', apiUrl);

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		};

		if (apiKey) {
			console.log('[ComfyUI] Using API key authentication');
			headers['Authorization'] = `Bearer ${apiKey}`;
		}

		try {
			// Check API connection
			console.log('[ComfyUI] Checking API connection...');
			await this.helpers.request({
				method: 'GET',
				url: `${apiUrl}/system_stats`,
				headers,
				json: true,
			});

			// Queue prompt
			console.log('[ComfyUI] Queueing prompt...');
			const response = await this.helpers.request({
				method: 'POST',
				url: `${apiUrl}/prompt`,
				headers,
				body: {
					prompt: JSON.parse(workflow),
				},
				json: true,
			});

			if (!response.prompt_id) {
				throw new NodeApiError(this.getNode(), { message: 'Failed to get prompt ID from ComfyUI' });
			}

			const promptId = response.prompt_id;
			console.log('[ComfyUI] Prompt queued with ID:', promptId);

			// Poll for completion
			let attempts = 0;
			const maxAttempts = 60 * timeout; // Convert minutes to seconds
			await new Promise(resolve => setTimeout(resolve, 5000));
			while (attempts < maxAttempts) {
				console.log(`[ComfyUI] Checking execution status (attempt ${attempts + 1}/${maxAttempts})...`);
				await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 seconds
				attempts++;

				const history = await this.helpers.request({
					method: 'GET',
					url: `${apiUrl}/history/${promptId}`,
					headers,
					json: true,
				});

				const promptResult = history[promptId];
				if (!promptResult) {
					console.log('[ComfyUI] Prompt not found in history');
					continue;
				}

				if (promptResult.status === undefined) {
					console.log('[ComfyUI] Execution status not found');
					continue;
				}
				if (promptResult.status?.completed) {
					console.log('[ComfyUI] Execution completed');

					if (promptResult.status?.status_str === 'error') {
						throw new NodeApiError(this.getNode(), { message: '[ComfyUI] Workflow execution failed' });
					}

					// Process outputs
					if (!promptResult.outputs) {
						throw new NodeApiError(this.getNode(), { message: '[ComfyUI] No outputs found in workflow result' });
					}

					const outputs = await Promise.all(
						Object.values(promptResult.outputs)
							.flatMap((nodeOutput: any) => nodeOutput.images || []) // assuming videos also listed under `images`, adjust if needed
							.filter((file: any) => file.type === 'output' || file.type === 'temp')
							.map(async (file: any) => {
								const isVideo = file.filename.endsWith('.mp4') || file.filename.endsWith('.webm') || outputFormat === 'mp4'; // extend as needed
								console.log(`[ComfyUI] Downloading ${file.type} file:`, file.filename);

								const fileUrl = `${apiUrl}/view?filename=${file.filename}&subfolder=${file.subfolder || ''}&type=${file.type || ''}`;

								try {
									const fileData = await this.helpers.request({
										method: 'GET',
										url: fileUrl,
										encoding: null,
										headers,
									});

									let item: INodeExecutionData;

									if (isVideo) {
										const videoBuffer = Buffer.from(fileData);
										const base64 = videoBuffer.toString('base64');
										const ext = file.filename.endsWith('.webm') ? 'webm' : 'mp4';
										const mime = ext === 'mp4' ? 'video/mp4' : 'video/webm';

										item = {
											json: {
												filename: file.filename,
												type: file.type,
												subfolder: file.subfolder || '',
												data: base64,
											},
											binary: {
												data: {
													fileName: file.filename,
													data: base64,
													fileType: 'video',
													fileSize: Math.round(videoBuffer.length / 1024 * 10) / 10 + " kB",
													fileExtension: ext,
													mimeType: mime,
												}
											}
										};

									} else {
										const image = await Jimp.read(Buffer.from(fileData, 'base64'));
										let outputBuffer: Buffer;
										if (outputFormat === 'jpeg') {
											outputBuffer = await image.getBuffer("image/jpeg", { quality: jpegQuality });
										} else {
											outputBuffer = await image.getBuffer(`image/png`);
										}
										const outputBase64 = outputBuffer.toString('base64');

										item = {
											json: {
												filename: file.filename,
												type: file.type,
												subfolder: file.subfolder || '',
												data: outputBase64,
											},
											binary: {
												data: {
													fileName: file.filename,
													data: outputBase64,
													fileType: 'image',
													fileSize: Math.round(outputBuffer.length / 1024 * 10) / 10 + " kB",
													fileExtension: outputFormat,
													mimeType: `image/${outputFormat}`,
												}
											}
										};
									}

									return item;

								} catch (error) {
									console.error(`[ComfyUI] Failed to download file ${file.filename}:`, error);
									return {
										json: {
											filename: file.filename,
											type: file.type,
											subfolder: file.subfolder || '',
											error: error.message,
										},
									};
								}
							})
						);

					console.log('[ComfyUI] All images downloaded successfully');
					return [outputs];
				}
			}
			throw new NodeApiError(this.getNode(), { message: `Execution timeout after ${timeout} minutes` });
		} catch (error) {
			console.error('[ComfyUI] Execution error:', error);
			throw new NodeApiError(this.getNode(), { message: `ComfyUI API Error: ${error.message}` });
		}
	}
}
