import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const SYSTEM_PROMPT = `你是一名专业的投研助手，正在帮助研究员整理访谈纪要。
你需要根据实时转录的对话内容，生成结构化的投研访谈笔记。

输出要求：
- 使用 Markdown 格式
- 语言跟随转录内容的语言（中文转录用中文写笔记，英文用英文）
- 简洁专业，突出投研关键信息
- 如果是增量更新，将新内容合并到已有笔记中，避免重复`;

export async function generateStructuredNotes(
  transcript,
  previousNotes,
  isFinal
) {
  const userPrompt = buildPrompt(transcript, previousNotes, isFinal);

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  return response.content[0].text;
}

function buildPrompt(transcript, previousNotes, isFinal) {
  let prompt = "";

  if (previousNotes) {
    prompt += `<previous_notes>\n${previousNotes}\n</previous_notes>\n\n`;
  }

  prompt += `<transcript>\n${transcript}\n</transcript>\n\n`;

  if (isFinal) {
    prompt += `<instructions>
这是完整的访谈转录内容。请生成最终版本的结构化访谈笔记。

请按以下格式输出：

## 访谈概要
（一两句话总结本次访谈的核心内容）

## 讨论主题
- （列出本次访谈涉及的核心话题）

## 关键信息
- （重要的事实、数据、观点）

## 财务数据
- （提到的具体数字：营收、利润率、增长率、估值等）

## 行业洞察
- （对行业趋势的判断和看法）

## 风险提示
- （提到的风险因素或不确定性）

## 待跟进
- （需要进一步追问或验证的问题）

如果某个分类没有相关内容，可以省略该分类。
</instructions>`;
  } else {
    prompt += `<instructions>
这是访谈过程中新增的转录内容。${previousNotes ? "请在已有笔记基础上更新，合并新内容，避免重复。" : "请生成初始版本的结构化笔记。"}

请按以下格式输出：

## 讨论主题
- （核心话题）

## 关键信息
- （重要事实、数据、观点）

## 财务数据
- （具体数字，如有）

## 待跟进
- （需要追问的问题，如有）

保持简洁，如果某个分类没有相关内容可以省略。
</instructions>`;
  }

  return prompt;
}
