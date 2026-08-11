import { Redirect } from 'expo-router';
import React from 'react';

export default function SignOutScreen() {
  return <Redirect href="/(auth)/sign-in" />;
}
