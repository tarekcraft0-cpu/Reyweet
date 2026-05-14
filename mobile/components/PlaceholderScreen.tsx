import { StyleSheet, Text, View } from "react-native";

export function PlaceholderScreen({ title, hint }: { title: string; hint: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.hint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 24, justifyContent: "center", backgroundColor: "#f1f5f9" },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
    color: "#0f172a",
  },
  hint: { fontSize: 15, lineHeight: 22, textAlign: "center", color: "#475569" },
});
