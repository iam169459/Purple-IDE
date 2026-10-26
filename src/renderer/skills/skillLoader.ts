import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

export interface Skill {
  name: string;
  description: string;
  content: string;
  location: string;
}

export class SkillLoader {
  private skills: Map<string, Skill> = new Map();
  
  loadSkills(basePath: string) {
    if (!existsSync(basePath)) return;
    const files = readdirSync(basePath).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const name = file.replace('.md', '');
      const content = readFileSync(join(basePath, file), 'utf-8');
      // Extract description from first heading
      const descMatch = content.match(/#\s+(.+?)(?:\n|$)/);
      this.skills.set(name, {
        name,
        description: descMatch ? descMatch[1] : name,
        content,
        location: join(basePath, file),
      });
    }
  }
  
  getSkill(name: string): Skill | undefined {
    return this.skills.get(name);
  }
  
  listSkills(): Skill[] {
    return Array.from(this.skills.values());
  }
}

export const globalSkillLoader = new SkillLoader();
