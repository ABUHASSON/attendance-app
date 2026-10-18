import { useState } from "react";
import SetupScreen from "@/components/SetupScreen";
import ClassroomScreen from "@/components/ClassroomScreen";

export default function App() {
  const [openId, setOpenId] = useState<string | null>(null);

  if (openId) {
    return (
      <ClassroomScreen sectionId={openId} onBack={() => setOpenId(null)} />
    );
  }
  return <SetupScreen onOpenSection={setOpenId} />;
}
