import OpenAI from "openai";

export function getAIClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.LLM_API_KEY || "",
    baseURL: process.env.LLM_BASE_URL || "https://api.deepseek.com",
  });
}

export function getModel(): string {
  return process.env.LLM_MODEL || "deepseek-chat";
}
