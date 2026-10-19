"use client";

import { useEffect, useState } from "react";
import { Button, Card, Col, Form, Input, Row, Switch, notification, ConfigProvider, theme as antdTheme } from "antd";
import { DownloadOutlined, SaveOutlined } from "@ant-design/icons";
import { getAuthHeaders } from "@/lib/admin-api";
import { useTheme } from "@/components/theme-provider";

interface SecurityPolicy {
  key: string;
  value: string;
}

export default function SecurityPoliciesPage() {
  const themeContext = useTheme();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const checkDark = () => {
      if (typeof document !== "undefined") {
        setIsDark(document.documentElement.classList.contains("dark"));
      }
    };
    checkDark();
    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [themeContext?.theme]);

  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [operator112Enabled, setOperator112Enabled] = useState(false);
  const [isSavingOperator112Access, setIsSavingOperator112Access] = useState(false);

  useEffect(() => {
    fetchPolicies();
  }, []);

  const fetchPolicies = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/security-policies", {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        const policies = data.policies || [];
        const initialValues: any = {};
        let nextOperator112Enabled = false;
        policies.forEach((p: SecurityPolicy) => {
          if (p.key === "ENABLE_OPERATOR_112_FOR_LESSONS") {
            nextOperator112Enabled = p.value === "true";
          } else if (p.key === "REQUIRE_2FA_ALL") {
            initialValues[p.key] = p.value === "true";
          } else {
            initialValues[p.key] = p.value;
          }
        });
        form.setFieldsValue(initialValues);
        setOperator112Enabled(nextOperator112Enabled);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleOperator112AccessChange = async (enabled: boolean) => {
    const previousValue = operator112Enabled;
    setOperator112Enabled(enabled);
    setIsSavingOperator112Access(true);

    try {
      const res = await fetch("/api/admin/security-policies", {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          policies: [
            {
              key: "ENABLE_OPERATOR_112_FOR_LESSONS",
              value: enabled.toString(),
            },
          ],
        }),
      });

      if (!res.ok) throw new Error("Не удалось сохранить настройку");
      notification.success({ message: "Доступ к роли «Оператор 112» обновлён" });
    } catch (error) {
      console.error(error);
      setOperator112Enabled(previousValue);
      notification.error({ message: "Не удалось обновить доступ к роли «Оператор 112»" });
    } finally {
      setIsSavingOperator112Access(false);
    }
  };

  const handleSave = async (values: any) => {
    const policies = Object.keys(values).map((key) => ({
      key,
      value: typeof values[key] === "boolean" ? values[key].toString() : values[key],
    }));

    try {
      const res = await fetch("/api/admin/security-policies", {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ policies }),
      });
      if (res.ok) {
        notification.success({ message: "Настройки безопасности сохранены" });
      } else {
        notification.error({ message: "Ошибка сохранения" });
      }
    } catch (error) {
      console.error(error);
      notification.error({ message: "Ошибка сохранения" });
    }
  };

  const handleDownloadReport = async () => {
    try {
      const res = await fetch("/api/admin/error-report/pdf", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "error_report.pdf";
        a.click();
        window.URL.revokeObjectURL(url);
      } else {
        notification.error({ message: "Ошибка скачивания отчета" });
      }
    } catch (error) {
      console.error(error);
      notification.error({ message: "Ошибка скачивания отчета" });
    }
  };

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        components: { Button: { primaryColor: isDark ? "#0B131E" : "#ffffff" } },
        token: isDark
          ? {
              colorBgContainer: "#192330",
              colorBgElevated: "#222E3E",
              colorBorder: "#334155",
              colorPrimary: "#7CA8DC",
              colorText: "#E6EDF5",
              colorTextSecondary: "#A6B4C6",
              colorTextTertiary: "#A6B4C6",
            }
          : undefined,
      }}
    >
      <div style={{ padding: 24 }}>
        <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
          <Col>
            <h2 className="text-2xl font-black text-foreground tracking-tight">Политики Безопасности</h2>
          </Col>
          <Col>
            <Button
              icon={<DownloadOutlined />}
              onClick={handleDownloadReport}
            >
              Скачать отчет о сбоях (PDF)
            </Button>
          </Col>
        </Row>

        <Card loading={loading}>
          <Form form={form} layout="vertical" onFinish={handleSave}>
            <Form.Item
              name="MIN_PASSWORD_LENGTH"
              label="Минимальная длина пароля"
              rules={[{ required: true, message: "Введите длину" }]}
            >
              <Input type="number" />
            </Form.Item>

            <Form.Item
              name="SESSION_TIMEOUT_MINUTES"
              label="Таймаут сессии (минуты)"
              rules={[{ required: true, message: "Введите таймаут" }]}
            >
              <Input type="number" />
            </Form.Item>

            <Form.Item
              name="REQUIRE_2FA_ALL"
              label="Принудительная 2FA для всех"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>

            <Form.Item
              label="Разрешить роль «Оператор 112» при создании уроков"
              extra="При выключенной настройке преподаватели видят и могут выбрать только роль «Диспетчер ДДС»."
            >
              <Switch
                checked={operator112Enabled}
                loading={isSavingOperator112Access}
                onChange={handleOperator112AccessChange}
                aria-label="Разрешить роль «Оператор 112» при создании уроков"
              />
            </Form.Item>

            <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
              Сохранить настройки
            </Button>
          </Form>
        </Card>
      </div>
    </ConfigProvider>
  );
}
