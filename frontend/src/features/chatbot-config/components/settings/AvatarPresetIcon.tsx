import { Bot, MessageCircle, Sparkles } from 'lucide-react-native';
import React from 'react';

type Props = {
  avatarId: string;
  size?: number;
  color: string;
};

export function AvatarPresetIcon({ avatarId, size = 18, color }: Props) {
  if (avatarId === 'bot') return <Bot size={size} color={color} />;
  if (avatarId === 'spark') return <Sparkles size={size} color={color} />;
  return <MessageCircle size={size} color={color} />;
}
