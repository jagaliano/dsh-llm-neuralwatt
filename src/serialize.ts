/**
 * Serialize harness messages into gateway chat completions. User text is
 * joined; assistant text becomes `content`, tool calls become `tool_calls`,
 * and tool results — first-class `role: 'tool'` messages since the 0.1.7
 * message model — become standalone `{role:'tool'}` entries. Assistant
 * reasoning is replayed as `reasoning_content` only on tool-call turns, as
 * required by DeepSeek-family upstreams (other OpenAI-compatible upstreams
 * ignore the field). Core image blocks are rejected explicitly because this
 * wire route is text-only. `developer` messages carry session tool
 * additions/removals, which the wire shape has no slot for: the effective
 * tool set already travels in `tools`, so those rows are skipped. No
 * reasoning-control fields are emitted: the adapter declares no reasoning
 * efforts, so callers cannot pass one.
 * @module dsh-llm-neuralwatt/serialize
 */

import { contentHasImage, LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, RequestMessage } from '@deepseek-ai/dsh-llm'
import type { WireMessage, WireRequest, WireTool } from './types.ts'

/** Join the text blocks of a message (used for user/system/tool content). */
function flattenText(blocks: readonly ContentBlock[]): string {
  return blocks
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
}

/** Reject core image content before any text-flattening path can silently erase it. */
function assertTextOnly(blocks: readonly ContentBlock[]): void {
  if (contentHasImage(blocks)) {
    throw new LlmError('The Neuralwatt chat-completions adapter does not support image content.', 'UNSUPPORTED_CONTENT')
  }
}

/** Serialize one assistant message (text + reasoning + tool calls). */
function serializeAssistant(content: readonly ContentBlock[]): WireMessage {
  const text = flattenText(content)
  const reasoning = content
    .filter(block => block.type === 'reasoning')
    .map(block => block.text)
    .join('')
  const toolCalls = content
    .filter(block => block.type === 'tool-call')
    .map(block => ({
      id: block.id,
      type: 'function' as const,
      function: { name: block.name, arguments: block.arguments },
    }))

  return {
    role: 'assistant',
    // Text-less turns send "" — NEVER null. Pure tool-call turns: some
    // gateways reject null outright. Reasoning-ONLY turns (the model can
    // answer entirely in the reasoning channel): the wire API rejects
    // null-content/no-tool_calls assistant messages with a 400, and since
    // the message sits durably in the session log, a null here bricks every
    // later turn of that session.
    content: text,
    // DeepSeek-family upstream passback rule: reasoning_content must return
    // on tool-call turns; it is ignored on plain turns, so we drop it there
    // to save tokens.
    ...toolCalls.length > 0 && reasoning.length > 0 ? { reasoning_content: reasoning } : {},
    ...toolCalls.length > 0 ? { tool_calls: toolCalls } : {},
  }
}

/**
 * Serialize the conversation. Tool results are their own `role: 'tool'`
 * messages in the 0.1.7 model, each answered to its `toolCallId`; user
 * messages contribute their text only. Developer messages (session tool
 * additions/removals) have no wire slot and are skipped.
 * @param messages - the harness conversation, in order.
 * @returns the wire messages; order preserved, each tool result expanded into its own entry.
 */
export function serializeMessages(messages: readonly RequestMessage[]): WireMessage[] {
  const wire: WireMessage[] = []
  for (const message of messages) {
    // Captured before the narrowing below so the unreachable tail can still name
    // the role that landed there.
    const role: string = message.role
    if (message.role === 'developer') continue
    assertTextOnly(message.content)
    if (message.role === 'system') {
      wire.push({ role: 'system', content: flattenText(message.content) })
      continue
    }
    if (message.role === 'assistant') {
      wire.push(serializeAssistant(message.content))
      continue
    }
    if (message.role === 'tool') {
      wire.push({
        role: 'tool',
        tool_call_id: message.toolCallId,
        // Empty tool output still needs SOME content on the wire.
        content: flattenText(message.content) || '(no output)',
      })
      continue
    }
    if (message.role === 'user') {
      wire.push({ role: 'user', content: flattenText(message.content) })
      continue
    }
    // Unreachable while MessageRoleMap stays closed. A role added upstream must
    // get an explicit branch here: silently degrading it to a user turn would
    // erase whatever it carried.
    const unhandled: never = message
    throw new LlmError(`The Neuralwatt chat-completions adapter cannot serialize a '${role}' message.`, 'UNSUPPORTED_CONTENT')
  }
  return wire
}

/**
 * Build the full wire request. Always streaming (`stream: true`, usage
 * reporting on); optional fields are omitted rather than sent as null, so
 * upstream defaults apply — including `max_tokens`, which this adapter has
 * no default for (heterogeneous upstreams each own their cap). An explicit
 * reasoning effort rides as OpenAI-compatible `reasoning_effort`; it only
 * ever arrives for a row whose catalog declares supported efforts.
 * @param options - the harness request (model, history, system, tools, sampling).
 * @returns the chat-completions request body.
 */
export function serializeRequest(options: GenerateOptions): WireRequest {
  const messages: WireMessage[] = []
  if (options.system !== undefined) {
    messages.push({ role: 'system', content: options.system })
  }
  messages.push(...serializeMessages(options.messages))

  const tools: WireTool[] | undefined = options.tools?.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))

  return {
    model: options.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    ...tools !== undefined && tools.length > 0 ? { tools } : {},
    ...options.temperature !== undefined ? { temperature: options.temperature } : {},
    ...options.maxTokens === undefined ? {} : { max_tokens: options.maxTokens },
    ...options.reasoningEffort !== undefined ? { reasoning_effort: options.reasoningEffort } : {},
    ...options.stop !== undefined ? { stop: options.stop } : {},
  }
}
