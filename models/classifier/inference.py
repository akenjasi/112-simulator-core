import os
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

class IntentClassifier:
    def __init__(self, model_path=None):
        if model_path is None:
            model_path = os.path.dirname(os.path.abspath(__file__))
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"Загрузка модели на {self.device}...")
        
        self.tokenizer = AutoTokenizer.from_pretrained(model_path)
        self.model = AutoModelForSequenceClassification.from_pretrained(model_path).to(self.device)
        self.model.eval()
        
        self.intent_names = {
            0: "Приветствие или молчание",
            1: "Запрос улицы и дома",
            2: "Запрос деталей адреса",
            3: "Запрос деталей ситуации",
            4: "Запрос о пострадавших",
            5: "Запрос ФИО",
            6: "Запрос телефона",
            7: "Переспрашивание / Плохая связь",
            8: "Неуместные вопросы",
            9: "Прощание / Завершение",
        }
        print("Готово!")

    def predict(self, text: str):
        inputs = self.tokenizer(text, return_tensors="pt", truncation=True, max_length=96).to(self.device)
        with torch.no_grad():
            outputs = self.model(**inputs)
            probs = torch.softmax(outputs.logits, dim=-1)[0]
            
        pred_label = torch.argmax(probs).item()
        confidence = probs[pred_label].item()
        
        return {
            "label_id": pred_label,
            "intent_name": self.intent_names[pred_label],
            "confidence": confidence,
            "all_probs": probs.cpu().numpy().tolist()
        }

if __name__ == "__main__":
    classifier = IntentClassifier()
    
    # Тест на простых фразах
    test_phrases = [
        "Где вы?",
        "Алло",
        "Все живы?",
        "Какой у вас номер паспорта?",
        "До свидания, скорая в пути"
    ]
    
    print("\n--- Тест простых фраз ---")
    for phrase in test_phrases:
        result = classifier.predict(phrase)
        print(f'"{phrase}"')
        print(f" -> [{result['label_id']}] {result['intent_name']} (уверенность: {result['confidence']:.1%})\n")
