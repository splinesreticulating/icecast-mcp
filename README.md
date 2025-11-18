# icecast-mcp

<div align="center">

[![MCP](https://img.shields.io/badge/MCP-Compatible-blue)](https://modelcontextprotocol.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

MCP server for analyzing and optimizing Icecast streaming server configurations.

[Features](#features) • [Installation](#installation) • [Usage](#usage) • [Tools](#tools) • [Docker](#docker)

</div>

---

## Overview

A Model Context Protocol (MCP) server for analyzing Icecast streaming server configurations. Provides automated security audits, performance recommendations, and capacity planning for internet radio stations and streaming infrastructure.

**Features:**
- Security auditing (authentication, credentials, access control)
- Performance analysis (limits, buffers, threading)
- Capacity planning based on listener counts
- Best practice recommendations for different deployment sizes

## Features

### Configuration Analysis
- Parse and validate Icecast XML configurations
- Detect security issues (default credentials, missing authentication)
- Identify performance bottlenecks (buffer sizes, thread pools, limits)
- Check reliability settings (timeouts, fallback mounts)
- Validate proxy configurations (X-Forwarded-For, hostname)

### Best Practice Recommendations
- Tailored advice for small, medium, and large deployments
- Capacity planning based on expected listener counts
- Security hardening guidelines
- Performance tuning recommendations

### What It Checks

| Category | Checks |
|----------|--------|
| **Security** | Authentication config, default credentials, relay passwords, admin security |
| **Performance** | Client limits, buffer sizes (queue/burst), thread pools, log verbosity |
| **Capacity** | Listener count vs. limits, resource allocation, scaling recommendations |
| **Reliability** | Mount points, fallback configuration, timeout settings |
| **Operations** | Hostname setup, proxy config, logging, log rotation |

## Installation

### From Source

```bash
git clone https://github.com/splinesreticulating/icecast-mcp.git
cd icecast-mcp
npm install
npm run build
```

### Using Docker

```bash
docker build -t icecast-mcp .
```

### Via npm (coming soon)

```bash
npm install -g icecast-mcp
```

## Usage

### With Claude Desktop

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "icecast": {
      "command": "node",
      "args": ["/absolute/path/to/icecast-mcp/build/index.js"]
    }
  }
}
```

Or using Docker:

```json
{
  "mcpServers": {
    "icecast": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-v",
        "/path/to/your/configs:/configs:ro",
        "icecast-mcp"
      ]
    }
  }
}
```

### With MCP Inspector

Test the server locally:

```bash
npm run build
npm run inspector
```

### With Other MCP Clients

The server communicates over stdio and follows the MCP specification. Compatible with any MCP client including [Claude Desktop](https://claude.ai/download).

## Tools

### `analyze_icecast_config`

Analyze an Icecast XML configuration file and receive detailed recommendations.

**Input Schema:**
```json
{
  "configPath": "/path/to/icecast.xml",
  "expectedListeners": 200
}
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `configPath` | string | Yes | - | Absolute path to Icecast XML config |
| `expectedListeners` | number | No | 100 | Expected concurrent listeners |

**Example Usage:**

```
Ask Claude: "Analyze my Icecast config at /etc/icecast2/icecast.xml for 500 expected listeners"
```

**Output Format:**

```markdown
# Icecast Configuration Analysis

Analyzing: /etc/icecast2/icecast.xml
Expected listeners: 500

## CRITICAL ISSUES

### Security: No authentication configured
Configure source-password and admin-password to secure your stream.

## WARNINGS

### Capacity: Client limit is quite low
Client limit is 50. This may cause connection rejections during peak times.
Current: 50
Recommended: 128

## INFORMATION

### Configuration: X-Forwarded-For is enabled
Good! This is correct when running behind a reverse proxy like Caddy.
```

### `get_icecast_best_practices`

Get deployment-specific best practices and configuration recommendations.

**Input Schema:**
```json
{
  "useCase": "medium"
}
```

| Parameter | Type | Required | Options | Description |
|-----------|------|----------|---------|-------------|
| `useCase` | string | Yes | `small`, `medium`, `large` | Deployment size |

**Use Case Definitions:**
- **small**: < 50 concurrent listeners
- **medium**: 50-500 concurrent listeners
- **large**: 500+ concurrent listeners

**Example Usage:**

```
Ask Claude: "What are the best practices for a medium-sized Icecast deployment?"
```

**Output**: Comprehensive guide covering limits, security, mount points, performance, and reliability for your deployment size.

## Docker

### Building

```bash
docker build -t icecast-mcp .
```

### Running with Volume Mounts

```bash
docker run -i --rm \
  -v /path/to/your/icecast/config:/config:ro \
  icecast-mcp
```

### Docker Compose Example

```yaml
version: '3.8'
services:
  icecast-mcp:
    build: .
    volumes:
      - ./ops/icecast:/config:ro
    stdin_open: true
    tty: true
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode (hot reload)
npm run dev

# Build TypeScript
npm run build

# Test with MCP Inspector
npm run inspector

# Run tests (if available)
npm test
```

## Example Usage

A typical workflow:

1. Install and configure icecast-mcp
2. Ask Claude: "Analyze my Icecast config at `/etc/icecast2/icecast.xml` for 200 listeners"
3. Get specific recommendations:
   - Optimize client limits for your traffic
   - Add relay password configuration
   - Configure fallback mount points
   - Enable log archiving

## Architecture

```
┌─────────────────┐
│  MCP Client     │  (Claude Desktop, etc.)
│  (AI Assistant) │
└────────┬────────┘
         │ stdio
         │
┌────────▼────────┐
│  icecast-mcp    │
│  MCP Server     │
├─────────────────┤
│ • XML Parser    │
│ • Analyzer      │
│ • Validator     │
│ • Recommender   │
└────────┬────────┘
         │
         ▼
   icecast.xml
```

## Contributing

Contributions welcome! Areas for improvement:

- Additional analysis rules
- Support for more Icecast features
- Performance metrics integration
- Live server monitoring
- Configuration generation

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk)

---

<div align="center">

[Report Bug](https://github.com/splinesreticulating/icecast-mcp/issues) • [Request Feature](https://github.com/splinesreticulating/icecast-mcp/issues)

</div>
