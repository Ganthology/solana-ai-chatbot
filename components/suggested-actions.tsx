"use client";

import { motion } from "framer-motion";
import { Button } from "./ui/button";
import { ChatRequestOptions, CreateMessage, Message } from "ai";
import { memo } from "react";

interface SuggestedActionsProps {
  chatId: string;
  append: (
    message: Message | CreateMessage,
    chatRequestOptions?: ChatRequestOptions
  ) => Promise<string | null | undefined>;
}

function PureSuggestedActions({ chatId, append }: SuggestedActionsProps) {
  const suggestedActions = [
    {
      title: "What is the current price",
      label: "of SOL?",
      action: "What is the current price of SOL",
    },
    {
      title: "Help me mint",
      label: `a collection of NFTs`,
      action: `Help me mint a collection of NFTs`,
    },
    {
      title: "Help me swap USDC",
      label: `for SOL`,
      action: `Help me swap USDC for SOL`,
    },
    {
      title: "Help me stake SOL",
      label: `with Jupiter`,
      action: `Help me stake SOL with Jupiter`,
    },
    {
      title: "Help me deploy a token",
      label: `on Solana`,
      action: `Help me deploy a token on Solana`,
    },
    {
      title: "Help me launch a pump fun token",
      label: `on Solana`,
      action: `Help me launch a pump fun token on Solana`,
    },
  ];

  return (
    <div className="grid sm:grid-cols-2 gap-2 w-full">
      {suggestedActions.map((suggestedAction, index) => (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ delay: 0.05 * index }}
          key={`suggested-action-${suggestedAction.title}-${index}`}
          className={index > 1 ? "hidden sm:block" : "block"}
        >
          <Button
            variant="ghost"
            onClick={async () => {
              window.history.replaceState({}, "", `/chat/${chatId}`);

              append({
                role: "user",
                content: suggestedAction.action,
              });
            }}
            className="text-left border rounded-xl px-4 py-3.5 text-sm flex-1 gap-1 sm:flex-col w-full h-auto justify-start items-start"
          >
            <span className="font-medium">{suggestedAction.title}</span>
            <span className="text-muted-foreground">
              {suggestedAction.label}
            </span>
          </Button>
        </motion.div>
      ))}
    </div>
  );
}

export const SuggestedActions = memo(PureSuggestedActions, () => true);
