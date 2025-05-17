
# n8n-nodes-comfyuinew

## Features

- Execute ComfyUI workflows directly from n8n
- Support for workflow JSON import
- Automatic image/video retrieval from workflow outputs
- Progress monitoring and error handling
- Support for API key authentication
- Configurable timeout settings

## Prerequisites

- n8n (version 1.0.0 or later)
- ComfyUI instance running and accessible
- Node.js 16 or newer

## Installation

```bash
npm install n8n-nodes-comfyuinew
```

## Node Configuration

### ComfyUI Node

This node allows you to execute ComfyUI workflows and retrieve generated images.

#### Settings

- **API URL**: The URL of your ComfyUI instance (default: http://127.0.0.1:8188)
- **API Key**: Optional API key if authentication is enabled
- **Workflow JSON**: The ComfyUI workflow in JSON format

#### Outputs

The node outputs an array of generated images with:
- `filename`: Name of the generated image file
- `subfolder`: Subfolder path if any
- `data`: Base64 encoded image data

## Usage Example

1. Export your workflow from ComfyUI as JSON
2. Create a new workflow in n8n
3. Add the ComfyUI node
4. Paste your workflow JSON
5. Configure the API URL
6. Execute and retrieve generated images

## Error Handling

The node includes comprehensive error handling for:
- API connection issues
- Invalid workflow JSON
- Execution failures
- Timeout conditions (default 20 minutes)

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Test
npm run test

# Lint
npm run lint
```

## License

[MIT](LICENSE.md)
 