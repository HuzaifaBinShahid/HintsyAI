const { Groq } = require('groq-sdk');

class GroqProvider {
    static async validateApiKey(key) {
        if (!key || typeof key !== 'string' || !key.startsWith('gsk_')) {
            return { success: false, error: 'Invalid Groq API key format.' };
        }

        try {
            const groq = new Groq({ apiKey: key });
            
            // Test the API key with a minimal request
            const response = await groq.chat.completions.create({
                messages: [{ role: 'user', content: 'Hi' }],
                model: 'llama-3.1-8b-instant',
                max_tokens: 1,
                temperature: 0
            });

            return { success: true };
        } catch (error) {
            console.error(`[GroqProvider] API key validation error:`, error);
            if (error.status === 401) {
                return { success: false, error: 'Invalid Groq API key' };
            }
            return { success: false, error: error.message || 'A network error occurred during validation.' };
        }
    }
}

/**
 * Creates a Groq STT session
 * Note: Groq doesn't have native real-time STT, so this is a placeholder
 * @param {object} opts - Configuration options
 * @param {string} opts.apiKey - Groq API key
 * @param {string} [opts.language='en'] - Language code
 * @param {object} [opts.callbacks] - Event callbacks
 * @returns {Promise<object>} STT session placeholder
 */
async function createSTT({ apiKey, language = "en", callbacks = {}, ...config }) {
  console.warn("[Groq] STT not natively supported. Consider using OpenAI or Deepgram for STT.")

  // Return a mock STT session that doesn't actually do anything
  return {
    sendRealtimeInput: async (audioData) => {
      console.warn("[Groq] STT sendRealtimeInput called but not implemented")
    },
    close: async () => {
      console.log("[Groq] STT session closed")
    },
  }
}

/**
 * Creates a Groq LLM instance
 * @param {object} opts - Configuration options
 * @param {string} opts.apiKey - Groq API key
 * @param {string} [opts.model='openai/gpt-oss-120b'] - Model name
 * @param {number} [opts.temperature=0.7] - Temperature
 * @param {number} [opts.maxTokens=8192] - Max tokens
 * @returns {object} LLM instance
 */
function createLLM({ apiKey, model = "openai/gpt-oss-120b", temperature = 0.7, maxTokens = 8192, ...config }) {
  const client = new Groq({ apiKey })

  return {
    generateContent: async (parts) => {
      const messages = []
      let systemPrompt = ""
      const userContent = []

      for (const part of parts) {
        if (typeof part === "string") {
          if (systemPrompt === "" && part.includes("You are")) {
            systemPrompt = part
          } else {
            userContent.push(part)
          }
        } else if (part.inlineData) {
          // Groq doesn't support images in most models, so we'll skip this
          console.warn("[Groq] Image content skipped - not supported by most Groq models")
        }
      }

      if (userContent.length > 0) {
        messages.push({ role: "user", content: userContent.join("\n") })
      }

      try {
        const completion = await client.chat.completions.create({
          messages: systemPrompt ? [{ role: "system", content: systemPrompt }, ...messages] : messages,
          model: model,
          temperature: temperature,
          max_tokens: maxTokens
        })

        return {
          text: completion.choices[0]?.message?.content || "",
          raw: completion
        }
      } catch (error) {
        console.error('[Groq] LLM error:', error)
        throw error
      }
    }
  }
}

/**
 * Creates a Groq streaming LLM instance
 * @param {object} opts - Configuration options
 * @param {string} opts.apiKey - Groq API key
 * @param {string} [opts.model='openai/gpt-oss-120b'] - Model name
 * @param {number} [opts.temperature=0.7] - Temperature
 * @param {number} [opts.maxTokens=8192] - Max tokens
 * @returns {object} Streaming LLM instance
 */
function createStreamingLLM({ apiKey, model = "openai/gpt-oss-120b", temperature = 0.7, maxTokens = 8192, ...config }) {
  const client = new Groq({ apiKey })

  return {
    streamChat: async (messages) => {
      console.log("[Groq Provider] Starting streaming request")

      // Create a ReadableStream to handle Groq's streaming response
      const stream = new ReadableStream({
        async start(controller) {
          try {
            console.log("[Groq Provider] Processing messages:", messages.length, "messages")

            // Convert multimodal messages to text-only format for Groq
            const groqMessages = messages.map(msg => {
              if (Array.isArray(msg.content)) {
                // Extract text from multimodal content and ignore images
                const textContent = msg.content
                  .filter(item => item.type === 'text')
                  .map(item => item.text)
                  .join('\n')
                
                console.log("[Groq Provider] Converted multimodal message to text:", textContent.substring(0, 100) + "...")
                
                return {
                  ...msg,
                  content: textContent
                }
              }
              return msg
            })

            // Start the streaming request to Groq
            const groqStream = await client.chat.completions.create({
              messages: groqMessages,
              model: model,
              temperature: temperature,
              max_tokens: maxTokens,
              stream: true
            })

            let chunkCount = 0
            let totalContent = ""

            // Process each chunk from Groq
            for await (const chunk of groqStream) {
              const content = chunk.choices[0]?.delta?.content
              if (content) {
                chunkCount++
                totalContent += content

                // Format as SSE data to match OpenAI format expected by AskService
                const data = JSON.stringify({
                  choices: [
                    {
                      delta: {
                        content: content,
                      },
                    },
                  ],
                })
                controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`))
              }
            }

            console.log(
              `[Groq Provider] Streamed ${chunkCount} chunks, total length: ${totalContent.length} chars`,
            )

            // Send the final done message
            controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"))
            controller.close()
            console.log("[Groq Provider] Streaming completed successfully")
          } catch (error) {
            console.error("[Groq Provider] Streaming error:", error)
            controller.error(error)
          }
        },
      })

      // Create a Response object with the stream (matching other providers)
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      })
    }
  }
}

module.exports = { createSTT, createLLM, createStreamingLLM, GroqProvider }
