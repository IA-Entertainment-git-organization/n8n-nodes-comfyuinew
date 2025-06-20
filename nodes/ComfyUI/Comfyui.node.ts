// eslint-disable-next-line n8n-nodes-base/node-filename-against-convention
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
		name: 'comfy',
		icon: 'file:comfy.svg',
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
		inputs: ['main'],
		outputs: ['main'],
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
			}
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {

		const items = this.getInputData();
		const credentials = await this.getCredentials('comfyUIApi');

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

		let returnData: any = [];

		for (let i = 0; i < items.length; i++) {
				const workflow = this.getNodeParameter('workflow', i) as string;

				const newData = await tryGenerateContentWithComfy(this, apiUrl, headers, workflow);

				newData.map(item => returnData.push(item));
		}

		console.log("**************************************************************");
		console.log("**************************************************************");

		return [returnData];
	}
}

 async function tryGenerateContentWithComfy(brain: IExecuteFunctions, apiUrl: string, headers: Record<string, string>, workflow: string) {
		try {
			// Check API connection
			console.log('[ComfyUI] Checking API connection...');
			await brain.helpers.request({
				method: 'GET',
				url: `${apiUrl}/system_stats`,
				headers,
				json: true,
			});

			// Queue prompt
			console.log('[ComfyUI] Queueing prompt...');
			const response = await brain.helpers.request({
				method: 'POST',
				url: `${apiUrl}/prompt`,
				headers,
				body: {
					prompt: JSON.parse(workflow),
				},
				json: true,
			});

			if (!response.prompt_id) {
				throw new NodeApiError(brain.getNode(), { message: 'Failed to get prompt ID from ComfyUI' });
			}

			const promptId = response.prompt_id;
			console.log('[ComfyUI] Prompt queued with ID:', promptId);

			// Poll for completion
			let attempts = 0;
			let maxAttempts = 1;
			await new Promise(resolve => setTimeout(resolve, 5000));
			while (attempts < maxAttempts) {
				console.log(`[ComfyUI] Checking execution status (attempt: ${attempts + 1})...`);
				await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 seconds
				attempts++;
				maxAttempts += 1;

				const history = await brain.helpers.request({
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
						throw new NodeApiError(brain.getNode(), { message: '[ComfyUI] Workflow execution failed' });
					}

					// Process outputs
					if (!promptResult.outputs) {
						throw new NodeApiError(brain.getNode(), { message: '[ComfyUI] No outputs found in workflow result' });
					}

					const filesToProcess = Object.values(promptResult.outputs).flatMap((nodeOutput: any) => {
								// Combine images and gifs arrays for each nodeOutput
								const files = [];
								if (nodeOutput.images) {
										files.push(...nodeOutput.images);
								}
								if (nodeOutput.gifs) {
										files.push(...nodeOutput.gifs);
								}
								return files;
						}).filter((file) => file.type === 'output' || file.type === 'temp');

    			const outputs = await Promise.all(
        				filesToProcess.map(async (file) => {

										const isVideo = file.filename.endsWith('.mp4') || file.filename.endsWith('.webm');
										console.log(`[ComfyUI] Downloading ${file.type} file:`, file.filename);

										const fileUrl = `${apiUrl}/view?filename=${file.filename}&subfolder=${file.subfolder || ''}&type=${file.type || ''}`;
										console.log("fileUrl: ", fileUrl);

										try {
												const fileData = await brain.helpers.request({
														method: 'GET',
														url: fileUrl,
														encoding: null, // Get data as a Buffer
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
																		fileUrl: fileUrl,
																		filePath: file.fullpath,
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
														// Ensure Jimp is correctly imported and available
														const image = await Jimp.read(fileData);
														const ext = file.filename.endsWith('.jpeg') ? 'jpeg' : 'png';
														const mime = ext === 'jpeg' ? 'image/jpeg' : 'image/png';

														let outputBuffer;
														if (ext === 'jpeg') {
																outputBuffer = await image.getBuffer("image/jpeg", { quality: 80 });
														} else {
																outputBuffer = await image.getBuffer(`image/png`);
														}
														const outputBase64 = outputBuffer.toString('base64');

														item = {
																json: {
																		filename: file.filename,
																		type: file.type,
																		subfolder: file.subfolder || '',
																		fileUrl: fileUrl,
																		filePath: file.fullpath,
																		data: outputBase64,
																},
																binary: {
																		data: {
																				fileName: file.filename,
																				data: outputBase64,
																				fileType: 'image',
																				fileExtension: ext,
																				mimeType: mime,
																				fileSize: Math.round(outputBuffer.length / 1024 * 10) / 10 + " kB",
																		}
																}
														};
												}

												return item;

										} catch (error: any) {
												console.error(`[ComfyUI] Failed to download file ${file.filename}:`, error);
												return {
														json: {
																filename: file.filename,
																type: file.type,
																subfolder: file.subfolder || '',
																error: error.message,
																fileUrl: fileUrl,
														},
												};
										}
								})
					 );

						console.log('[ComfyUI] All Files downloaded successfully!');
						return outputs;
				}
			}
			throw new NodeApiError(brain.getNode(), { message: `Execution timeout` });
		} catch (error: any) {
			console.error('[ComfyUI] Execution error:', error);
			throw new NodeApiError(brain.getNode(), { message: `ComfyUI API Error: ${error.message}` });
		}
 }
