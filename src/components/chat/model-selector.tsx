"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const FALLBACK_MODELS = ["qwen2.5-coder", "llama3.1"];

interface Props {
  value: string;
  onChange: (model: string) => void;
}

export function ModelSelector({ value, onChange }: Props) {
  const [models, setModels] = useState<string[]>(FALLBACK_MODELS);

  useEffect(() => {
    const controller = new AbortController();
    fetch("http://localhost:11434/api/tags", { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        const names = (data.models as { name: string }[])?.map((m) => m.name);
        if (names?.length) setModels(names);
      })
      .catch(() => {
        // Ollama not running or request aborted - keep fallback list
      });
    return () => controller.abort();
  }, []);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-48 text-xs">
        <SelectValue placeholder="Select model" />
      </SelectTrigger>
      <SelectContent>
        {models.map((m) => (
          <SelectItem key={m} value={m} className="text-xs">
            {m}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
