import type { HldModel, LldModel, RequirementsSpec } from "@sda/contracts";

function short(value: string, max = 220): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/**
 * Prompt-side context compression. The full canonical models stay in the DB;
 * the model only needs ids, names, types, relationships, and short intent.
 * Long rationale/trade-off prose is omitted to cut input tokens.
 */
export function compactRequirements(spec: RequirementsSpec) {
  return {
    functional: spec.functional.map((item) => ({
      id: item.id,
      text: short(item.text, 300),
      priority: item.priority,
    })),
    nonFunctional: spec.nonFunctional.map((item) => ({
      id: item.id,
      text: short(item.text, 300),
      priority: item.priority,
      category: item.category,
      target: item.target,
    })),
    assumptions: spec.assumptions.map((item) => ({
      id: item.id,
      text: short(item.text, 220),
    })),
    clarifications: spec.clarifications.map((item) => ({
      id: item.id,
      question: short(item.question, 220),
      answer: item.answer ? short(item.answer, 300) : "",
    })),
  };
}

export function compactHld(hld: HldModel) {
  return {
    components: hld.components.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      technology: item.technology,
      responsibility: short(item.responsibility, 220),
    })),
    connections: hld.connections.map((item) => ({
      id: item.id,
      fromComponentId: item.fromComponentId,
      toComponentId: item.toComponentId,
      kind: item.kind,
      label: item.label,
      protocol: item.protocol,
    })),
    flows: hld.flows.map((item) => ({
      id: item.id,
      name: item.name,
      steps: item.steps.map((step) => ({
        order: step.order,
        description: short(step.description, 160),
        elementRefs: step.elementRefs,
      })),
    })),
    technologyDecisions: hld.technologyDecisions.map((item) => ({
      id: item.id,
      topic: item.topic,
      choice: item.choice,
    })),
    scalabilityNotes: hld.scalabilityNotes.map((item) => ({
      id: item.id,
      aspect: item.aspect,
    })),
    failureScenarios: hld.failureScenarios.map((item) => ({
      id: item.id,
      condition: short(item.condition, 180),
    })),
  };
}

export function compactLld(lld: LldModel) {
  return {
    classes: lld.classes.map((item) => ({
      id: item.id,
      name: item.name,
      kind: item.kind,
      responsibility: short(item.responsibility, 180),
      attributes: item.attributes.map((attribute) => ({
        name: attribute.name,
        type: attribute.type,
      })),
      methods: item.methods.map((method) => ({
        name: method.name,
        signature: method.signature,
      })),
    })),
    relationships: lld.relationships.map((item) => ({
      id: item.id,
      kind: item.kind,
      sourceId: item.sourceId,
      targetId: item.targetId,
      label: item.label,
    })),
    patterns: lld.patterns.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      participantClassIds: item.participantClassIds,
      rationale: short(item.rationale, 200),
    })),
  };
}
