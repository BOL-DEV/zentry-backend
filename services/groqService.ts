import axios from "axios";
import { AppError } from "../utils/appError";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

const groqApi = axios.create({
  baseURL: GROQ_BASE_URL,
  headers: {
    Authorization: `Bearer ${GROQ_API_KEY}`,
    "Content-Type": "application/json",
  },
});

type GenerateEventCopyInput = {
  title: string;
  highlights?: string;
  tone?: string;
  location?: string;
};

type GenerateEventCopyResult = {
  description: string;
  tagline: string;
  socialCaption: string;
};

export const generateEventCopy = async (
  input: GenerateEventCopyInput,
): Promise<GenerateEventCopyResult> => {
  if (!GROQ_API_KEY) {
    throw new AppError("AI copy generation is not configured", 500);
  }

  const { title, highlights, tone = "professional", location } = input;

  const systemPrompt =
    "You are a copywriter for an event ticketing platform. Given an event title and optional details, " +
    "write marketing copy for the event organizer. Respond ONLY with a JSON object with exactly these keys: " +
    '"description" (2-4 sentences an attendee would read on the event page), ' +
    '"tagline" (a short punchy one-liner, under 12 words), ' +
    '"socialCaption" (a caption suited for Instagram/X/WhatsApp, may include relevant emoji and hashtags). ' +
    "No other text, no markdown, just the JSON object.";

  const userPrompt = [
    `Event title: ${title}`,
    location ? `Location: ${location}` : null,
    highlights ? `Highlights/keywords from the organizer: ${highlights}` : null,
    `Desired tone: ${tone}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await groqApi.post("/chat/completions", {
      model: GROQ_MODEL,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const content = response.data?.choices?.[0]?.message?.content;

    if (!content) {
      throw new AppError("AI provider returned an empty response", 502);
    }

    let parsed: Partial<GenerateEventCopyResult>;

    try {
      parsed = JSON.parse(content);
    } catch {
      throw new AppError("AI provider returned an unreadable response", 502);
    }

    if (!parsed.description || !parsed.tagline || !parsed.socialCaption) {
      throw new AppError("AI provider response was incomplete", 502);
    }

    return {
      description: parsed.description,
      tagline: parsed.tagline,
      socialCaption: parsed.socialCaption,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        throw new AppError(
          "AI copy generation is rate-limited right now, try again shortly",
          429,
        );
      }

      throw new AppError("AI copy generation failed, try again shortly", 502);
    }

    throw new AppError("AI copy generation failed, try again shortly", 502);
  }
};
