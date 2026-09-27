"use client";

import { useEffect, useState } from "react";
import { Button, Card, Col, Form, Input, Row, Switch, notification } from "antd";
import { DownloadOutlined, SaveOutlined } from "@ant-design/icons";

interface SecurityPolicy {
  key: string;
  value: string;
}

export default function SecurityPoliciesPage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchPolicies();
  }, []);

  const fetchPolicies = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/security-policies", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        const policies = data.policies || [];
        const initialValues: any = {};
        policies.forEach((p: SecurityPolicy) => {
          if (p.key === "REQUIRE_2FA_ALL") {
            initialValues[p.key] = p.value === "true";
          } else {
            initialValues[p.key] = p.value;
          }
        });
        form.setFieldsValue(initialValues);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
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
    <div style={{ padding: 24 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <h2>Политики Безопасности</h2>
        </Col>
        <Col>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleDownloadReport}
            style={{ backgroundColor: "#ff4d4f", borderColor: "#ff4d4f" }}
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

          <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
            Сохранить настройки
          </Button>
        </Form>
      </Card>
    </div>
  );
}
