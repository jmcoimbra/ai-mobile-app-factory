import { ChecklistScreen } from '@/features/checklist/ChecklistScreen';
import { checklistApiFor } from '@/shared/api/checklist';
import { appConfig } from '@/shared/config/app-config';

const api = checklistApiFor(appConfig.apiBaseUrl);

export default function Index() {
  return <ChecklistScreen api={api} />;
}
