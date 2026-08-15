import { OperatorFieldIntro } from './OperatorFieldIntro';
import { OperatorHubSection } from './OperatorHubSection';

export default function OperatorPage() {
  return (
    <div class="space-y-4">
      <OperatorFieldIntro />
      <OperatorHubSection variant="landing" showPageHeader={false} />
    </div>
  );
}

export { OperatorHubSection };
