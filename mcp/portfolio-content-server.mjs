#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const dataFilePath = path.join(projectRoot, 'data', 'portfolio-content.json');
const protocolVersion = '2024-11-05';

const toolDefinitions = [
  {
    name: 'get_content_schema',
    description: 'Get the portfolio content schema and section types supported by the detail page renderer.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'list_series',
    description: 'List all series in the portfolio content file. Optionally filter by tag.',
    inputSchema: {
      type: 'object',
      properties: {
        tag: { type: 'string', description: 'Optional tag filter such as product, web, mobile, or brand.' }
      }
    }
  },
  {
    name: 'get_series',
    description: 'Get one series entry including detail metadata and sections.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Series id.' }
      }
    }
  },
  {
    name: 'upsert_series',
    description: 'Create or replace a whole series entry. Use this when you want full control over the series payload.',
    inputSchema: {
      type: 'object',
      required: ['series'],
      properties: {
        series: {
          type: 'object',
          description: 'Full series object matching the portfolio content schema.'
        }
      }
    }
  },
  {
    name: 'update_series_detail',
    description: 'Patch detail metadata such as eyebrow, title, summary, hero image, and hero copy for an existing series.',
    inputSchema: {
      type: 'object',
      required: ['id', 'detail'],
      properties: {
        id: { type: 'string', description: 'Series id.' },
        detail: {
          type: 'object',
          description: 'Partial detail patch. Supports eyebrow, title, summary, hero, and sections.'
        }
      }
    }
  },
  {
    name: 'replace_series_sections',
    description: 'Replace the detail sections for a given series.',
    inputSchema: {
      type: 'object',
      required: ['id', 'sections'],
      properties: {
        id: { type: 'string', description: 'Series id.' },
        sections: {
          type: 'array',
          description: 'Array of section objects used by the detail page renderer.'
        }
      }
    }
  },
  {
    name: 'delete_series',
    description: 'Delete a series from the portfolio content file.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Series id to delete.' }
      }
    }
  }
];

function send(message) {
  const json = JSON.stringify(message);
  const body = Buffer.from(json, 'utf8');
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

function sendResult(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function sendError(id, code, message, data) {
  send({
    jsonrpc: '2.0',
    id,
    error: { code, message, data }
  });
}

function readDataFile() {
  const raw = fs.readFileSync(dataFilePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.series)) {
    parsed.series = [];
  }
  return parsed;
}

function writeDataFile(payload) {
  const nextPayload = {
    version: payload.version || 1,
    updatedAt: new Date().toISOString(),
    series: Array.isArray(payload.series) ? payload.series : []
  };

  fs.writeFileSync(dataFilePath, `${JSON.stringify(nextPayload, null, 2)}\n`, 'utf8');
  return nextPayload;
}

function requireArgs(args, keys) {
  const missing = keys.filter((key) => args?.[key] === undefined || args?.[key] === null || args?.[key] === '');
  if (missing.length) {
    throw new Error(`Missing required argument(s): ${missing.join(', ')}`);
  }
}

function findSeriesIndex(seriesList, id) {
  return seriesList.findIndex((entry) => entry?.id === id);
}

function createTextResult(value) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

function deepMerge(target, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return patch;
  }

  const output = { ...(target || {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (Array.isArray(value)) {
      output[key] = value;
      continue;
    }

    if (value && typeof value === 'object') {
      output[key] = deepMerge(output[key], value);
      continue;
    }

    output[key] = value;
  }
  return output;
}

function getSchemaDescription() {
  return {
    dataFilePath,
    rootShape: {
      version: 'number',
      updatedAt: 'ISO datetime string',
      series: 'array'
    },
    seriesShape: {
      id: 'string',
      title: 'string',
      eyebrow: 'string',
      summary: 'string',
      tags: ['product | web | mobile | brand | custom'],
      items: [
        {
          title: 'string',
          meta: 'string',
          image: 'string URL',
          alt: 'string optional',
          href: 'string URL optional'
        }
      ],
      detail: {
        eyebrow: 'string',
        title: 'string',
        summary: 'string',
        hero: {
          title: 'string',
          subtitle: 'string',
          image: 'string URL',
          alt: 'string optional',
          href: 'string URL optional'
        },
        sections: [
          {
            id: 'string',
            type: 'text | image | gallery | quote',
            label: 'string optional',
            heading: 'string optional',
            summary: 'string optional',
            body: 'string optional'
          }
        ]
      }
    },
    sectionTypes: {
      text: {
        required: ['id', 'type'],
        optional: ['label', 'heading', 'summary', 'body']
      },
      image: {
        required: ['id', 'type', 'image'],
        optional: ['label', 'heading', 'summary', 'title', 'body', 'alt', 'href']
      },
      gallery: {
        required: ['id', 'type', 'items'],
        optional: ['label', 'heading', 'summary']
      },
      quote: {
        required: ['id', 'type', 'quote'],
        optional: ['label', 'heading', 'summary', 'source']
      }
    }
  };
}

async function handleToolCall(name, args = {}) {
  if (name === 'get_content_schema') {
    return createTextResult(getSchemaDescription());
  }

  if (name === 'list_series') {
    const payload = readDataFile();
    const tag = args.tag;
    const filtered = tag
      ? payload.series.filter((entry) => Array.isArray(entry.tags) && entry.tags.includes(tag))
      : payload.series;

    return createTextResult({
      total: filtered.length,
      series: filtered.map((entry) => ({
        id: entry.id,
        title: entry.title,
        eyebrow: entry.eyebrow,
        tags: entry.tags,
        summary: entry.summary,
        sectionCount: Array.isArray(entry.detail?.sections) ? entry.detail.sections.length : 0
      }))
    });
  }

  if (name === 'get_series') {
    requireArgs(args, ['id']);
    const payload = readDataFile();
    const series = payload.series.find((entry) => entry.id === args.id);
    if (!series) {
      throw new Error(`Series not found: ${args.id}`);
    }
    return createTextResult(series);
  }

  if (name === 'upsert_series') {
    requireArgs(args, ['series']);
    const nextSeries = args.series;
    requireArgs(nextSeries, ['id', 'title']);

    const payload = readDataFile();
    const existingIndex = findSeriesIndex(payload.series, nextSeries.id);

    if (existingIndex >= 0) {
      payload.series[existingIndex] = nextSeries;
    } else {
      payload.series.push(nextSeries);
    }

    const saved = writeDataFile(payload);
    return createTextResult({
      action: existingIndex >= 0 ? 'updated' : 'created',
      id: nextSeries.id,
      total: saved.series.length,
      series: nextSeries
    });
  }

  if (name === 'update_series_detail') {
    requireArgs(args, ['id', 'detail']);
    const payload = readDataFile();
    const index = findSeriesIndex(payload.series, args.id);
    if (index < 0) {
      throw new Error(`Series not found: ${args.id}`);
    }

    const current = payload.series[index];
    current.detail = deepMerge(current.detail || {}, args.detail);
    payload.series[index] = current;
    writeDataFile(payload);

    return createTextResult({
      action: 'updated',
      id: args.id,
      detail: current.detail
    });
  }

  if (name === 'replace_series_sections') {
    requireArgs(args, ['id', 'sections']);
    if (!Array.isArray(args.sections)) {
      throw new Error('sections must be an array');
    }

    const payload = readDataFile();
    const index = findSeriesIndex(payload.series, args.id);
    if (index < 0) {
      throw new Error(`Series not found: ${args.id}`);
    }

    const current = payload.series[index];
    current.detail = current.detail || {};
    current.detail.sections = args.sections;
    payload.series[index] = current;
    writeDataFile(payload);

    return createTextResult({
      action: 'updated',
      id: args.id,
      sectionCount: args.sections.length,
      sections: args.sections
    });
  }

  if (name === 'delete_series') {
    requireArgs(args, ['id']);
    const payload = readDataFile();
    const existingIndex = findSeriesIndex(payload.series, args.id);
    if (existingIndex < 0) {
      throw new Error(`Series not found: ${args.id}`);
    }

    const [deleted] = payload.series.splice(existingIndex, 1);
    const saved = writeDataFile(payload);

    return createTextResult({
      action: 'deleted',
      id: args.id,
      total: saved.series.length,
      deleted
    });
  }

  throw new Error(`Unknown tool: ${name}`);
}

async function handleMessage(message) {
  if (!message || typeof message !== 'object') {
    return;
  }

  const { id, method, params } = message;

  try {
    if (method === 'initialize') {
      sendResult(id, {
        protocolVersion,
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'zeno-portfolio-content',
          version: '0.1.0'
        }
      });
      return;
    }

    if (method === 'notifications/initialized') {
      return;
    }

    if (method === 'tools/list') {
      sendResult(id, { tools: toolDefinitions });
      return;
    }

    if (method === 'tools/call') {
      const result = await handleToolCall(params?.name, params?.arguments || {});
      sendResult(id, result);
      return;
    }

    if (id !== undefined) {
      sendError(id, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    if (id !== undefined) {
      sendError(id, -32000, error instanceof Error ? error.message : String(error));
    }
  }
}

let buffer = Buffer.alloc(0);

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);

  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      return;
    }

    const headerText = buffer.slice(0, headerEnd).toString('utf8');
    const headers = Object.fromEntries(
      headerText
        .split('\r\n')
        .map((line) => {
          const separatorIndex = line.indexOf(':');
          return [line.slice(0, separatorIndex).trim().toLowerCase(), line.slice(separatorIndex + 1).trim()];
        })
    );

    const contentLength = Number(headers['content-length']);
    if (!Number.isFinite(contentLength)) {
      buffer = Buffer.alloc(0);
      return;
    }

    const messageEnd = headerEnd + 4 + contentLength;
    if (buffer.length < messageEnd) {
      return;
    }

    const body = buffer.slice(headerEnd + 4, messageEnd).toString('utf8');
    buffer = buffer.slice(messageEnd);

    try {
      const message = JSON.parse(body);
      handleMessage(message);
    } catch (error) {
      sendError(null, -32700, 'Parse error', error instanceof Error ? error.message : String(error));
    }
  }
});

process.stdin.on('end', () => {
  process.exit(0);
});
