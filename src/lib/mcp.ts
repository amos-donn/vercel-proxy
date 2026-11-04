import type { McpTool } from '../types'

export interface ToolField {
  name: string
  kind: 'string' | 'number' | 'boolean'
  required: boolean
  description?: string
}

export function toolFields(tool: McpTool): ToolField[] {
  const schema = tool.inputSchema ?? {}
  const properties =
    schema.properties && typeof schema.properties === 'object'
      ? (schema.properties as Record<string, Record<string, unknown>>)
      : {}
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : []
  return Object.entries(properties).map(([name, definition]) => {
    const type = typeof definition.type === 'string' ? definition.type : 'string'
    return {
      name,
      kind: type === 'number' || type === 'integer' ? 'number' : type === 'boolean' ? 'boolean' : 'string',
      required: required.includes(name),
      ...(typeof definition.description === 'string' ? { description: definition.description } : {}),
    }
  })
}

/** Turn the form's string values into the JSON the server expects. */
export function coerceToolArgs(
  fields: ToolField[],
  raw: Record<string, string>,
): { args: Record<string, unknown>; error?: string } {
  const args: Record<string, unknown> = {}
  for (const field of fields) {
    const value = (raw[field.name] ?? '').trim()
    if (!value) {
      if (field.required) return { args, error: `${field.name} is required.` }
      continue
    }
    if (field.kind === 'number') {
      const parsed = Number(value)
      if (!Number.isFinite(parsed)) return { args, error: `${field.name} must be a number.` }
      args[field.name] = parsed
    } else if (field.kind === 'boolean') {
      args[field.name] = value === 'true'
    } else {
      args[field.name] = raw[field.name]
    }
  }
  return { args }
}
