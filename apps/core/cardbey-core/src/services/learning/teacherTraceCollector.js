/**
 * Collects successful executions as teacher traces for future DeepSeek prompting
 */

export async function collectTeacherTrace(execution) {
  if (execution.outcome !== 'success') return;
  
  // Only collect high-confidence executions for teacher traces
  if (execution.confidence < 0.9) return;
  
  const embedding = await generateEmbedding(execution.goal + execution.reasoning);
  
  await prisma.teacherTrace.upsert({
    where: { id: execution.traceId },
    update: {
      successRate: { increment: 1 },
      embedding
    },
    create: {
      category: execution.intent.category,
      goal: execution.goal,
      reasoning: execution.reasoning,
      plan: execution.plan,
      action: execution.action,
      outcome: execution.outcome,
      successRate: 1,
      embedding
    }
  });
}