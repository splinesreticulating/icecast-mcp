#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { XMLParser } from "fast-xml-parser";
import { readFileSync } from "fs";
import { z } from "zod";

// Icecast configuration schema
const IcecastConfigSchema = z.object({
  location: z.string().optional(),
  admin: z.string().optional(),
  limits: z.object({
    clients: z.number().optional(),
    sources: z.number().optional(),
    "queue-size": z.number().optional(),
    "burst-size": z.number().optional(),
    threadpool: z.number().optional(),
    "source-timeout": z.number().optional(),
    "header-timeout": z.number().optional(),
    "client-timeout": z.number().optional(),
  }).optional(),
  authentication: z.object({
    "source-password": z.string().optional(),
    "admin-user": z.string().optional(),
    "admin-password": z.string().optional(),
    "relay-password": z.string().optional(),
  }).optional(),
  hostname: z.string().optional(),
  "listen-socket": z.union([
    z.object({
      port: z.number().optional(),
      "bind-address": z.string().optional(),
    }),
    z.array(z.object({
      port: z.number().optional(),
      "bind-address": z.string().optional(),
    }))
  ]).optional(),
  fileserve: z.number().optional(),
  "use-x-forwarded-for": z.number().optional(),
  mount: z.union([
    z.object({
      "mount-name": z.string(),
    }),
    z.array(z.object({
      "mount-name": z.string(),
    }))
  ]).optional(),
  paths: z.object({
    logdir: z.string().optional(),
    webroot: z.string().optional(),
    adminroot: z.string().optional(),
    pidfile: z.string().optional(),
  }).optional(),
  logging: z.object({
    accesslog: z.string().optional(),
    errorlog: z.string().optional(),
    loglevel: z.number().optional(),
    logsize: z.number().optional(),
    logarchive: z.number().optional(),
  }).optional(),
});

type IcecastConfig = z.infer<typeof IcecastConfigSchema>;

interface ConfigIssue {
  severity: "critical" | "warning" | "info";
  category: string;
  issue: string;
  recommendation: string;
  currentValue?: any;
  recommendedValue?: any;
}

// Parse Icecast XML configuration
function parseIcecastConfig(xmlContent: string): IcecastConfig {
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: true,
    parseAttributeValue: true,
  });

  const parsed = parser.parse(xmlContent);
  return parsed.icecast || {};
}

// Analyze configuration and provide recommendations
function analyzeConfig(config: IcecastConfig, context?: { expectedListeners?: number }): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const expectedListeners = context?.expectedListeners || 100;

  // Check client limits
  const clientLimit = config.limits?.clients;
  if (clientLimit !== undefined) {
    if (clientLimit > 1000 && expectedListeners < 500) {
      issues.push({
        severity: "info",
        category: "Performance",
        issue: "Client limit may be unnecessarily high",
        recommendation: `Client limit is ${clientLimit}. Consider lowering to ${Math.max(128, expectedListeners * 2)} unless you expect high traffic.`,
        currentValue: clientLimit,
        recommendedValue: Math.max(128, expectedListeners * 2),
      });
    }

    if (clientLimit < 50) {
      issues.push({
        severity: "warning",
        category: "Capacity",
        issue: "Client limit is quite low",
        recommendation: `Client limit is ${clientLimit}. This may cause connection rejections during peak times.`,
        currentValue: clientLimit,
        recommendedValue: 128,
      });
    }
  } else {
    issues.push({
      severity: "warning",
      category: "Configuration",
      issue: "No client limit specified",
      recommendation: "Set an explicit client limit to control resource usage.",
      recommendedValue: 128,
    });
  }

  // Check authentication
  if (!config.authentication) {
    issues.push({
      severity: "critical",
      category: "Security",
      issue: "No authentication configured",
      recommendation: "Configure source-password and admin-password to secure your stream.",
    });
  } else {
    if (config.authentication["admin-user"] === "admin") {
      issues.push({
        severity: "warning",
        category: "Security",
        issue: "Using default admin username",
        recommendation: "Change admin username from 'admin' to something less predictable.",
        currentValue: "admin",
      });
    }

    if (!config.authentication["relay-password"]) {
      issues.push({
        severity: "info",
        category: "Security",
        issue: "No relay password configured",
        recommendation: "If you plan to use relays, configure a relay-password.",
      });
    }
  }

  // Check mount configuration
  if (!config.mount) {
    issues.push({
      severity: "warning",
      category: "Configuration",
      issue: "No mount points configured",
      recommendation: "Configure at least one mount point with appropriate settings.",
    });
  } else {
    const mounts = Array.isArray(config.mount) ? config.mount : [config.mount];

    if (mounts.length === 1) {
      issues.push({
        severity: "info",
        category: "Reliability",
        issue: "No fallback mount configured",
        recommendation: "Consider adding a fallback mount for better reliability.",
      });
    }
  }

  // Check logging
  if (config.logging) {
    if (!config.logging.logarchive) {
      issues.push({
        severity: "info",
        category: "Maintenance",
        issue: "Log archiving not configured",
        recommendation: "Enable log archiving to automatically rotate old logs.",
        recommendedValue: 1,
      });
    }

    const logLevel = config.logging.loglevel;
    if (logLevel !== undefined && logLevel > 3) {
      issues.push({
        severity: "info",
        category: "Performance",
        issue: "High log verbosity",
        recommendation: `Log level is ${logLevel}. Consider level 3 for production (4 for debug).`,
        currentValue: logLevel,
        recommendedValue: 3,
      });
    }
  }

  // Check burst size
  const burstSize = config.limits?.["burst-size"];
  const queueSize = config.limits?.["queue-size"];
  if (burstSize && queueSize && burstSize > queueSize / 2) {
    issues.push({
      severity: "warning",
      category: "Performance",
      issue: "Burst size is very large relative to queue size",
      recommendation: `Burst size (${burstSize}) should typically be less than half of queue size (${queueSize}).`,
      currentValue: burstSize,
      recommendedValue: Math.floor(queueSize / 2),
    });
  }

  // Check hostname
  if (config.hostname === "localhost") {
    issues.push({
      severity: "info",
      category: "Configuration",
      issue: "Hostname is set to localhost",
      recommendation: "Set hostname to your actual domain name for proper stream URLs in directory listings.",
    });
  }

  // Check X-Forwarded-For
  if (config["use-x-forwarded-for"] === 1) {
    issues.push({
      severity: "info",
      category: "Configuration",
      issue: "X-Forwarded-For is enabled",
      recommendation: "Good! This is correct when running behind a reverse proxy like Caddy.",
    });
  }

  return issues;
}

// Format issues as readable text
function formatIssues(issues: ConfigIssue[]): string {
  if (issues.length === 0) {
    return "No issues found! Your Icecast configuration looks good.";
  }

  const grouped = {
    critical: issues.filter(i => i.severity === "critical"),
    warning: issues.filter(i => i.severity === "warning"),
    info: issues.filter(i => i.severity === "info"),
  };

  let output = "";

  if (grouped.critical.length > 0) {
    output += "## CRITICAL ISSUES\n\n";
    grouped.critical.forEach(issue => {
      output += `### ${issue.category}: ${issue.issue}\n`;
      output += `${issue.recommendation}\n`;
      if (issue.currentValue !== undefined) {
        output += `Current: ${issue.currentValue}\n`;
      }
      if (issue.recommendedValue !== undefined) {
        output += `Recommended: ${issue.recommendedValue}\n`;
      }
      output += "\n";
    });
  }

  if (grouped.warning.length > 0) {
    output += "## WARNINGS\n\n";
    grouped.warning.forEach(issue => {
      output += `### ${issue.category}: ${issue.issue}\n`;
      output += `${issue.recommendation}\n`;
      if (issue.currentValue !== undefined) {
        output += `Current: ${issue.currentValue}\n`;
      }
      if (issue.recommendedValue !== undefined) {
        output += `Recommended: ${issue.recommendedValue}\n`;
      }
      output += "\n";
    });
  }

  if (grouped.info.length > 0) {
    output += "## INFORMATION\n\n";
    grouped.info.forEach(issue => {
      output += `### ${issue.category}: ${issue.issue}\n`;
      output += `${issue.recommendation}\n`;
      if (issue.currentValue !== undefined) {
        output += `Current: ${issue.currentValue}\n`;
      }
      if (issue.recommendedValue !== undefined) {
        output += `Recommended: ${issue.recommendedValue}\n`;
      }
      output += "\n";
    });
  }

  return output;
}

// Create MCP server
const server = new Server(
  {
    name: "icecast-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool: Analyze Icecast config
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "analyze_icecast_config",
        description: "Analyze an Icecast XML configuration file and provide recommendations for improvements. Checks security, performance, capacity, and reliability settings.",
        inputSchema: {
          type: "object",
          properties: {
            configPath: {
              type: "string",
              description: "Path to the Icecast XML configuration file",
            },
            expectedListeners: {
              type: "number",
              description: "Expected number of concurrent listeners (optional, default: 100)",
            },
          },
          required: ["configPath"],
        },
      },
      {
        name: "get_icecast_best_practices",
        description: "Get general best practices and recommendations for Icecast configuration based on use case",
        inputSchema: {
          type: "object",
          properties: {
            useCase: {
              type: "string",
              description: "Use case: 'small' (< 50 listeners), 'medium' (50-500 listeners), 'large' (500+ listeners)",
              enum: ["small", "medium", "large"],
            },
          },
          required: ["useCase"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    return {
      content: [{ type: "text", text: "Missing arguments" }],
      isError: true,
    };
  }

  if (name === "analyze_icecast_config") {
    const configPath = args.configPath as string;
    const expectedListeners = (args.expectedListeners as number) || 100;

    try {
      const xmlContent = readFileSync(configPath, "utf-8");
      const config = parseIcecastConfig(xmlContent);
      const issues = analyzeConfig(config, { expectedListeners });
      const report = formatIssues(issues);

      return {
        content: [
          {
            type: "text",
            text: `# Icecast Configuration Analysis\n\nAnalyzing: ${configPath}\nExpected listeners: ${expectedListeners}\n\n${report}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error analyzing configuration: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  if (name === "get_icecast_best_practices") {
    const useCase = args.useCase as string;

    const practices: Record<string, string> = {
      small: `# Best Practices for Small Streams (< 50 listeners)

## Limits
- clients: 64-128
- sources: 4
- queue-size: 524288 (512KB)
- burst-size: 65535 (64KB)
- threadpool: 4-8

## Security
- Always set source-password and admin-password
- Change admin username from default 'admin'
- Use strong passwords (16+ characters)

## Mount Points
- Configure explicit mount point with metadata
- Set fallback mount for reliability
- Consider dump-file for recording

## Performance
- Keep log level at 3 (info) or lower
- Enable log archiving
- Monitor log files regularly

## Behind Reverse Proxy
- Set use-x-forwarded-for to 1
- Configure hostname to your domain
- Let proxy handle SSL/TLS`,

      medium: `# Best Practices for Medium Streams (50-500 listeners)

## Limits
- clients: 256-512
- sources: 8
- queue-size: 1048576 (1MB)
- burst-size: 131072 (128KB)
- threadpool: 16-32

## Security
- Use strong unique passwords
- Consider IP-based restrictions for admin
- Enable relay authentication if using relays
- Regular password rotation

## Mount Points
- Multiple mount points for different bitrates
- Fallback mounts configured
- Consider on-demand relays for scaling

## Performance
- Monitor resource usage
- Consider multiple listen-sockets if needed
- Use appropriate timeouts (client: 30s)
- Enable burst-on-connect for better UX

## Reliability
- Set up monitoring/alerts
- Regular log analysis
- Consider backup stream source

## Behind Reverse Proxy
- use-x-forwarded-for: 1
- Proper hostname configuration
- Load balancing if needed`,

      large: `# Best Practices for Large Streams (500+ listeners)

## Limits
- clients: 1024-2048+
- sources: 16+
- queue-size: 2097152+ (2MB+)
- burst-size: 262144+ (256KB+)
- threadpool: 32-64

## Security
- Strict authentication on all endpoints
- IP whitelisting for admin access
- Separate relay passwords
- Regular security audits

## Architecture
- Multiple Icecast instances with load balancing
- Relay/edge servers for geographic distribution
- Dedicated source server
- CDN integration consideration

## Mount Points
- Multiple bitrate options
- Separate mobile/desktop streams
- Fallback chain configured
- Metadata management system

## Performance
- Dedicated hardware/VMs
- Network bandwidth monitoring
- Multiple listen-sockets on different IPs
- Optimized timeouts
- Minimal logging in production

## Monitoring
- Real-time listener analytics
- Resource monitoring (CPU, RAM, bandwidth)
- Automated alerting
- Log aggregation

## Reliability
- Redundant source connections
- Automated failover
- Geographic redundancy
- Regular backup testing

## Behind Reverse Proxy/CDN
- use-x-forwarded-for: 1
- Proper hostname for directory listings
- Consider HLS/DASH for better scaling
- Cache static content aggressively`,
    };

    const content = practices[useCase] || "Invalid use case. Use: small, medium, or large";

    return {
      content: [
        {
          type: "text",
          text: content,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: `Unknown tool: ${name}`,
      },
    ],
    isError: true,
  };
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Icecast MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
