# ⚔️ YouTube Yorum Puan Liderlik Tablosu

Ortaçağ temalı YouTube yorum puan takip sistemi. Kanala yorum yapan kullanıcılar otomatik olarak puan kazanır (her yorum = +30 puan). En yüksek puanlı 10 kullanıcı liderlik tablosunda gösterilir.

## 🚀 Kurulum

### 1. GitHub Pages'i Aktifleştir
`Settings → Pages → Source: Deploy from a branch → Branch: main / (root)` seçin.

Siteniz `https://KULLANICI_ADINIZ.github.io/YoutubeCommentPoints/` adresinde yayınlanır.

---

### 2. YouTube Data API v3 Anahtarı Al

1. [Google Cloud Console](https://console.cloud.google.com/) → **New Project** oluştur
2. **APIs & Services → Library** → `YouTube Data API v3` → Enable
3. **APIs & Services → Credentials → Create Credentials → API Key**
4. Anahtarı kopyala (Admin paneline yapıştıracaksın)

> **Not:** Ücretsiz kotası günlük 10.000 units'tir. Normal kullanım için yeterli.

---

### 3. GitHub Personal Access Token (PAT) Al

Admin paneli, puanları `data/scores.json` dosyasına kaydetmek için bu tokena ihtiyaç duyar.

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens**
2. **Generate new token**
3. Repo erişimi: Sadece `YoutubeCommentPoints` reposu
4. Permissions: **Contents → Read and write**
5. Token'ı kopyala (Admin paneline yapıştıracaksın)

---

### 4. GitHub Actions Secret Ekle (Otomatik Kontrol İçin)

GitHub Actions ile 7/24 otomatik çalışma için:

1. Repo → **Settings → Secrets and variables → Actions → New repository secret**
2. İsim: `YT_API_KEY`  
   Değer: YouTube API anahtarın

Workflow her 6 saatte bir otomatik çalışır. Değiştirmek için `.github/workflows/auto-check.yml` içindeki cron ifadesini düzenle: [crontab.guru](https://crontab.guru)

---

### 5. Admin Paneli Kullan

1. `https://...github.io/YoutubeCommentPoints/admin.html` adresine git
2. Varsayılan şifre: **`kale2024`** *(ilk girişten sonra değiştir!)*
3. Kimlik bilgilerini gir ve **Kaydet**
4. **Yorumları Şimdi Kontrol Et** ile ilk kontrolü yap

---

## 📁 Dosya Yapısı

```
YoutubeCommentPoints/
├── index.html              ← Liderlik tablosu (herkese açık)
├── admin.html              ← Yönetici paneli (şifre korumalı)
├── style.css               ← Ortaçağ tasarım sistemi
├── js/
│   ├── api.js              ← YouTube API entegrasyonu
│   ├── scores.js           ← Puan yönetimi + GitHub kayıt
│   ├── leaderboard.js      ← Liderlik tablosu render
│   └── scheduler.js        ← Tarayıcı-taraflı zamanlayıcı
├── data/
│   ├── scores.json         ← Puan veritabanı (otomatik güncellenir)
│   └── config.json         ← Kanal URL ve ayarlar
├── scripts/
│   └── check-comments.mjs  ← GitHub Actions için Node.js scripti
└── .github/
    └── workflows/
        └── auto-check.yml  ← Otomatik kontrol workflow'u
```

---

## ⚙️ Ayarlar

| Ayar | Varsayılan | Açıklama |
|------|-----------|----------|
| Puan / Yorum | 30 | Her yorum için kazanılan puan |
| Kontrol Sıklığı | 6 saat | GitHub Actions cron |
| Admin Şifresi | `kale2024` | İlk girişte değiştirmeniz önerilir |

---

## 🔒 Güvenlik Notları

- API Key ve PAT **tarayıcının localStorage'ında** saklanır — GitHub'a yüklenmez
- Admin paneli `noindex` meta etiketiyle arama motorlarından gizlenmiştir
- PAT'ı yalnızca bu repo için minimal izinlerle oluşturun

---

## 📜 Lisans

MIT
