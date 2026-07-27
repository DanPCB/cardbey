/**
 * Skill Registry
 * Manages available skills for the orchestrator
 */

import { SkillDefinition } from '../types.js';

/**
 * In-memory skill registry
 */
const skills: SkillDefinition[] = [];

/**
 * Add a skill to the registry
 * @param skill - Skill definition to add
 */
export function addSkill(skill: SkillDefinition): void {
  // Check if skill with same ID already exists
  const existing = skills.find(s => s.id === skill.id);
  if (existing) {
    throw new Error(`Skill with ID "${skill.id}" already exists`);
  }
  
  skills.push(skill);
}

/**
 * Get a skill by ID
 * @param skillId - Skill ID to retrieve
 * @returns Skill definition or undefined if not found
 */
export function getSkillById(skillId: string): SkillDefinition | undefined {
  return skills.find(s => s.id === skillId);
}

/**
 * Find skills by tag
 * @param tag - Tag to search for
 * @returns Array of matching skills
 */
export function findSkillsByTag(tag: string): SkillDefinition[] {
  return skills.filter(s => s.tags.includes(tag));
}

/**
 * List all registered skills
 * @returns Array of all skills
 */
export function listSkills(): SkillDefinition[] {
  return [...skills];
}

/**
 * Remove a skill from the registry
 * @param skillId - Skill ID to remove
 * @returns True if skill was removed, false if not found
 */
export function removeSkill(skillId: string): boolean {
  const index = skills.findIndex(s => s.id === skillId);
  if (index === -1) {
    return false;
  }
  
  skills.splice(index, 1);
  return true;
}

/**
 * Clear all skills from registry
 */
export function clearSkills(): void {
  skills.length = 0;
}


