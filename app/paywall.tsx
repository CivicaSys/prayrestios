// app/paywall.tsx
import { PREMIUM_ENTITLEMENT_ID } from '@/lib/entitlement';
import { supabase } from '@/lib/supabase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';

export default function Paywall() {
  const router = useRouter();
  const { context } = useLocalSearchParams<{ context?: string }>();
  const isResubscribe = context === 'resubscribe';
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [selected, setSelected] = useState<PurchasesPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    const loadOfferings = async () => {
      try {
        const offerings = await Purchases.getOfferings();
        const available = offerings.current?.availablePackages ?? [];
        setPackages(available);
        setSelected(available.find((pkg) => pkg.identifier === '$rc_annual') ?? available[0] ?? null);
      } catch (err) {
        console.error('Failed to load offerings:', err);
      } finally {
        setLoading(false);
      }
    };
    loadOfferings();
  }, []);

  const handleSubscribe = async () => {
    if (!selected) return;
    setPurchasing(true);
    try {
      await Purchases.purchasePackage(selected);
      router.replace(isResubscribe ? '/(tabs)' : '/signup');
    } catch (err: any) {
      if (!err?.userCancelled) {
        Alert.alert('Something went wrong', 'Please try again.');
      }
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    try {
      const info = await Purchases.restorePurchases();
      if (PREMIUM_ENTITLEMENT_ID in info.entitlements.active) {
        router.replace(isResubscribe ? '/(tabs)' : '/signup');
      } else {
        Alert.alert('Nothing to restore', 'No previous purchases found on this Apple ID.');
      }
    } catch (err) {
      console.error('Restore purchases failed:', err);
      Alert.alert('Something went wrong', 'Please try again.');
    }
  };

  const handleBack = async () => {
    if (isResubscribe) {
      await supabase.auth.signOut();
    } else {
      router.back();
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#D4A853" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{isResubscribe ? 'Your trial has ended' : 'Start Your Free Trial'}</Text>
      <Text style={styles.subtitle}>
        {isResubscribe
          ? 'Subscribe to keep praying with PrayRest.'
          : '7 days free, then continue for less than a coffee a week.'}
      </Text>
      <View style={styles.plans}>
        {packages.map((pkg) => (
          <TouchableOpacity
            key={pkg.identifier}
            style={[styles.plan, selected?.identifier === pkg.identifier && styles.planSelected]}
            onPress={() => setSelected(pkg)}
          >
            <Text style={styles.planTitle}>{pkg.product.title}</Text>
            <Text style={styles.planPrice}>{pkg.product.priceString}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={styles.button} onPress={handleSubscribe} disabled={purchasing || !selected}>
        <Text style={styles.buttonText}>{purchasing ? 'Processing...' : 'Start Free Trial'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleRestore}>
        <Text style={styles.link}>Restore Purchases</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleBack}>
        <Text style={styles.link}>{isResubscribe ? 'Sign Out' : 'Back'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#FDF8F0' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#3D2E1F', textAlign: 'center', marginBottom: 12 },
  subtitle: { fontSize: 16, color: '#6B5A45', textAlign: 'center', marginBottom: 24 },
  plans: { width: '100%', marginBottom: 24 },
  plan: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 2, borderColor: 'transparent' },
  planSelected: { borderColor: '#D4A853' },
  planTitle: { fontSize: 16, fontWeight: 'bold', color: '#3D2E1F' },
  planPrice: { fontSize: 14, color: '#6B5A45', marginTop: 4 },
  button: { backgroundColor: '#D4A853', paddingVertical: 16, borderRadius: 20, width: '100%', alignItems: 'center', marginBottom: 16 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  link: { color: '#3D2E1F', fontSize: 15, textDecorationLine: 'underline', marginBottom: 16 },
});
