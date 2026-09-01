import { requireGuild } from "@/lib/guild";
import { ModuleHeader, Panel } from "@/components/ui";
import { ComponentEditor } from "@/components/component-editor";

export default async function NewComponentTemplatePage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const guild = await requireGuild(guildId);

  return (
    <div>
      <ModuleHeader
        title={`Components · ${guild.guildName}`}
        description="Neues V2-Template anlegen."
      />

      <Panel>
        <ComponentEditor guildId={guildId} />
      </Panel>
    </div>
  );
}
