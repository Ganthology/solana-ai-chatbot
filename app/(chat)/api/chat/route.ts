import {
  type Message,
  convertToCoreMessages,
  createDataStreamResponse,
  streamObject,
  streamText,
} from "ai";
import { z } from "zod";
import { SolanaAgentKit } from "solana-agent-kit";
import { PublicKey } from "@solana/web3.js";

import { auth } from "@/app/(auth)/auth";
import { customModel } from "@/lib/ai";
import { models } from "@/lib/ai/models";
import {
  codePrompt,
  systemPrompt,
  updateDocumentPrompt,
} from "@/lib/ai/prompts";
import {
  deleteChatById,
  getChatById,
  getDocumentById,
  saveChat,
  saveDocument,
  saveMessages,
  saveSuggestions,
} from "@/lib/db/queries";
import type { Suggestion } from "@/lib/db/schema";
import {
  generateUUID,
  getMostRecentUserMessage,
  sanitizeResponseMessages,
} from "@/lib/utils";

import { generateTitleFromUserMessage } from "../../actions";
import { launchPumpFunToken } from "solana-agent-kit/dist/tools";

export const maxDuration = 60;

type AllowedTools =
  | "checkTokenPrice"
  | "stakeSOL"
  | "mintNFT"
  | "swapTokens"
  | "deployToken"
  | "launchPumpFunToken";

const tokenTools: AllowedTools[] = [
  "checkTokenPrice",
  "stakeSOL",
  "mintNFT",
  "swapTokens",
  "deployToken",
  "launchPumpFunToken",
];

const allTools: AllowedTools[] = [...tokenTools];

export async function POST(request: Request) {
  const {
    id,
    messages,
    modelId,
  }: { id: string; messages: Array<Message>; modelId: string } =
    await request.json();

  const session = await auth();

  if (!session || !session.user || !session.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const model = models.find((model) => model.id === modelId);

  if (!model) {
    return new Response("Model not found", { status: 404 });
  }

  const coreMessages = convertToCoreMessages(messages);
  const userMessage = getMostRecentUserMessage(coreMessages);

  if (!userMessage) {
    return new Response("No user message found", { status: 400 });
  }

  const chat = await getChatById({ id });

  if (!chat) {
    const title = await generateTitleFromUserMessage({ message: userMessage });
    await saveChat({ id, userId: session.user.id, title });
  }

  const userMessageId = generateUUID();

  await saveMessages({
    messages: [
      { ...userMessage, id: userMessageId, createdAt: new Date(), chatId: id },
    ],
  });

  // Initialize with private key and optional RPC URL
  const agent = new SolanaAgentKit(
    process.env.SOLANA_PRIVATE_KEY as string,
    "https://api.mainnet-beta.solana.com",
    process.env.OPENAI_API_KEY as string
  );

  return createDataStreamResponse({
    execute: (dataStream) => {
      dataStream.writeData({
        type: "user-message-id",
        content: userMessageId,
      });

      const result = streamText({
        model: customModel(model.apiIdentifier),
        system: systemPrompt,
        messages: coreMessages,
        maxSteps: 5,
        experimental_activeTools: allTools,
        tools: {
          checkTokenPrice: {
            description: "Check the current price of a token/crypto currency",
            parameters: z.object({
              symbol: z.string().describe("The symbol of the asset to check"),
            }),
            execute: async ({ symbol }) => {
              const tokenData = await agent.getTokenDataByTicker(symbol);

              return tokenData;
            },
          },
          stakeSOL: {
            description: "Stake SOL on Solana",
            parameters: z.object({
              amount: z.string().describe("The amount of SOL to stake"),
            }),
            execute: async ({ amount }) => {
              const stakeResult = await agent.stake(amount);

              return stakeResult;
            },
          },
          mintNFT: {
            description: "Mint an NFT on Solana",
            parameters: z.object({
              collectionMint: z
                .string()
                .describe("The mint address of the collection"),
              metadata: z.string().describe("The metadata of the NFT"),
              recipient: z.string().describe("The recipient of the NFT"),
            }),
            execute: async ({ collectionMint, metadata, recipient }) => {
              const mintResult = await agent.mintNFT(
                collectionMint,
                metadata,
                recipient
              );

              return mintResult;
            },
          },
          swapTokens: {
            description: "Swap tokens on Solana",
            parameters: z.object({
              targetToken: z.string().describe("The target token to swap to"),
              amount: z.string().describe("The amount of tokens to swap"),
              sourceToken: z.string().describe("The source token to swap from"),
              slippage: z.string().describe("The slippage of the swap"),
            }),
            execute: async ({ targetToken, sourceToken, amount, slippage }) => {
              const swapResult = await agent.trade(
                new PublicKey(targetToken),
                amount,
                new PublicKey(sourceToken),
                slippage
              );

              return swapResult;
            },
          },
          deployToken: {
            description: "Deploy a token on Solana",
            parameters: z.object({
              tokenName: z.string().describe("The name of the token"),
              tokenTicker: z.string().describe("The ticker of the token"),
              uri: z.string().describe("The URI of the token"),
              decimals: z.number().describe("The decimals of the token"),
              supply: z.number().describe("The supply of the token"),
            }),
            execute: async ({
              tokenName,
              tokenTicker,
              uri,
              decimals,
              supply,
            }) => {
              const deployResult = await agent.deployToken(
                tokenName,
                tokenTicker,
                uri,
                decimals,
                supply
              );

              return deployResult;
            },
          },
          launchPumpFunToken: {
            description: "Launch a pump fun token on Solana",
            parameters: z.object({
              tokenName: z.string().describe("The name of the token"),
              tokenTicker: z.string().describe("The ticker of the token"),
              description: z.string().describe("The description of the token"),
              imageUrl: z.string().describe("The image URL of the token"),
            }),
            execute: async ({
              tokenName,
              tokenTicker,
              description,
              imageUrl,
            }) => {
              const launchResult = await agent.launchPumpFunToken(
                tokenName,
                tokenTicker,
                description,
                imageUrl
              );

              return launchResult;
            },
          },
        },
        onFinish: async ({ response }) => {
          if (session.user?.id) {
            try {
              const responseMessagesWithoutIncompleteToolCalls =
                sanitizeResponseMessages(response.messages);

              await saveMessages({
                messages: responseMessagesWithoutIncompleteToolCalls.map(
                  (message) => {
                    const messageId = generateUUID();

                    if (message.role === "assistant") {
                      dataStream.writeMessageAnnotation({
                        messageIdFromServer: messageId,
                      });
                    }

                    return {
                      id: messageId,
                      chatId: id,
                      role: message.role,
                      content: message.content,
                      createdAt: new Date(),
                    };
                  }
                ),
              });
            } catch (error) {
              console.error("Failed to save chat");
            }
          }
        },
        experimental_telemetry: {
          isEnabled: true,
          functionId: "stream-text",
        },
      });

      result.mergeIntoDataStream(dataStream);
    },
  });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new Response("Not Found", { status: 404 });
  }

  const session = await auth();

  if (!session || !session.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const chat = await getChatById({ id });

    if (chat.userId !== session.user.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    await deleteChatById({ id });

    return new Response("Chat deleted", { status: 200 });
  } catch (error) {
    return new Response("An error occurred while processing your request", {
      status: 500,
    });
  }
}
