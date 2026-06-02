import { JobRecord } from "./types.ts";

type AlertRule = {
  name: string;
  sound: string;
  minSalary: number | null;
  titleContains: string | null;
  minStandoutSkills: number;
};

// AlertRule comes from alerts.json
export function evaluateAlerts(job: JobRecord, rules: AlertRule[]): string[] {
  // TODO: years of experience check
  return rules
    .filter((rule) => {
      if (rule.minSalary && (!job.salary?.min || job.salary.min < rule.minSalary)) {
        return false;
      }

      if (rule.titleContains) {
        const terms = rule.titleContains.split('|').map((t) => t.trim().toLowerCase()).filter(Boolean);
        const titleNorm = job.titleNormalized.toLowerCase();
        if (!terms.some((t) => titleNorm.includes(t))) return false;
      }

      if (rule.minStandoutSkills && job.skillsStandout.length < rule.minStandoutSkills) {
        return false;
      }
      
      return true;
    })
    .map((r) => r.sound);
}
