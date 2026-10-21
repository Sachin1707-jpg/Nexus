import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSchema } from '../src/services/schemaNormalizer.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { TOOLS } from '../src/tools/index.js';

test('schemaNormalizer: schemas without references remain valid', () => {
  const schema = {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'User name' },
      age: { type: 'integer' }
    },
    required: ['name']
  };
  const norm = normalizeSchema(schema);
  assert.equal(norm.type, 'OBJECT');
  assert.equal(norm.properties.name.type, 'STRING');
  assert.equal(norm.properties.age.type, 'INTEGER');
  assert.deepEqual(norm.required, ['name']);
});

test('schemaNormalizer: expands $defs and resolves $ref correctly', () => {
  const schema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    $defs: {
      Address: {
        type: 'object',
        properties: {
          city: { type: 'string' },
          zip: { type: 'string' }
        },
        required: ['city']
      }
    },
    properties: {
      homeAddress: { $ref: '#/$defs/Address' }
    }
  };
  const norm = normalizeSchema(schema);
  assert.equal(norm.properties.homeAddress.type, 'OBJECT');
  assert.equal(norm.properties.homeAddress.properties.city.type, 'STRING');
  assert.equal(norm.$defs, undefined);
  assert.equal(norm.properties.homeAddress.$ref, undefined);
});

test('schemaNormalizer: resolves definitions and local pointers (#/properties/...)', () => {
  const schema = {
    type: 'object',
    properties: {
      from: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      to: { $ref: '#/properties/from' }
    },
    required: ['from', 'to']
  };
  const norm = normalizeSchema(schema);
  assert.equal(norm.properties.to.type, 'STRING');
  assert.equal(norm.properties.to.$ref, undefined);
  assert.equal(norm.properties.from.pattern, undefined);
});

test('schemaNormalizer: resolves nested array item references', () => {
  const schema = {
    type: 'object',
    definitions: {
      Tag: { type: 'string', description: 'A single tag' }
    },
    properties: {
      tags: {
        type: 'array',
        items: { $ref: '#/definitions/Tag' }
      }
    }
  };
  const norm = normalizeSchema(schema);
  assert.equal(norm.properties.tags.type, 'ARRAY');
  assert.equal(norm.properties.tags.items.type, 'STRING');
  assert.equal(norm.properties.tags.items.description, 'A single tag');
});

test('schemaNormalizer: detects missing references and fails safely', () => {
  const schema = {
    type: 'object',
    properties: {
      item: { $ref: '#/$defs/NonExistent' }
    }
  };
  assert.throws(() => normalizeSchema(schema), /Cannot resolve \$ref/);
});

test('schemaNormalizer: detects circular references and fails safely', () => {
  const schema = {
    type: 'object',
    $defs: {
      NodeA: {
        type: 'object',
        properties: {
          next: { $ref: '#/$defs/NodeB' }
        }
      },
      NodeB: {
        type: 'object',
        properties: {
          next: { $ref: '#/$defs/NodeA' }
        }
      }
    },
    properties: {
      root: { $ref: '#/$defs/NodeA' }
    }
  };
  assert.throws(() => normalizeSchema(schema), /Circular reference detected/);
});

test('schemaNormalizer: normalizes all 29 MCP tools without $ref remaining (reproducing 400 prevention)', async () => {
  const server = new McpServer({ name: 'test-server', version: '1.0.0' });
  for (const t of TOOLS) {
    server.registerTool(t.name, { inputSchema: t.schema }, async () => ({}));
  }
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [sTransport, cTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(sTransport), client.connect(cTransport)]);

  const { tools: mcpTools } = await client.listTools();
  assert.equal(mcpTools.length, 29, `Expected 29 tools, got ${mcpTools.length}`);

  for (const t of mcpTools) {
    const norm = normalizeSchema(t.inputSchema);
    const jsonStr = JSON.stringify(norm);
    assert.ok(!jsonStr.includes('"$ref"'), `Tool "${t.name}" still contains $ref`);
    assert.ok(!jsonStr.includes('"$defs"'), `Tool "${t.name}" still contains $defs`);
    assert.ok(!jsonStr.includes('"definitions"'), `Tool "${t.name}" still contains definitions`);
    assert.ok(norm.type === 'OBJECT' || norm.properties !== undefined, `Tool "${t.name}" must be an object`);
  }

  await client.close();
  await server.close();
});
