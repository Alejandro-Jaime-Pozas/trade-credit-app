"use client";

import React from "react";

export type CustomerFormValues = {
  name: string;
  legalName: string;
  rfc: string;
  codigoPostal: string;
  tipoDeVialidad: string;
  nombreDeVialidad: string;
  numeroExterior: string;
  numeroInterior: string;
  nombreDeLaColonia: string;
  nombreDeLaLocalidad: string;
  nombreDelMunicipio: string;
  nombreDeLaEntidadFederativa: string;
};

export const emptyCustomerFormValues = (): CustomerFormValues => ({
  name: "",
  legalName: "",
  rfc: "",
  codigoPostal: "",
  tipoDeVialidad: "",
  nombreDeVialidad: "",
  numeroExterior: "",
  numeroInterior: "",
  nombreDeLaColonia: "",
  nombreDeLaLocalidad: "",
  nombreDelMunicipio: "",
  nombreDeLaEntidadFederativa: "",
});

type CustomerFormFieldsProps = {
  values: CustomerFormValues;
  onChange: (values: CustomerFormValues) => void;
  nameRequired?: boolean;
};

function updateField<K extends keyof CustomerFormValues>(
  values: CustomerFormValues,
  onChange: (values: CustomerFormValues) => void,
  key: K,
  value: CustomerFormValues[K],
) {
  onChange({ ...values, [key]: value });
}

export function CustomerFormFields(props: CustomerFormFieldsProps) {
  const { values, onChange, nameRequired = true } = props;

  return (
    <div className="space-y-4">
      <label className="block">
        <div className="text-sm font-medium">Nombre comercial</div>
        <input
          value={values.name}
          onChange={(e) => updateField(values, onChange, "name", e.target.value)}
          required={nameRequired}
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          placeholder="Nombre comercial"
        />
      </label>

      <label className="block">
        <div className="text-sm font-medium">Razón social (legal name)</div>
        <input
          value={values.legalName}
          onChange={(e) => updateField(values, onChange, "legalName", e.target.value)}
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          placeholder="Razón social"
        />
      </label>

      <label className="block">
        <div className="text-sm font-medium">RFC</div>
        <input
          value={values.rfc}
          onChange={(e) => updateField(values, onChange, "rfc", e.target.value)}
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          placeholder="RFC (persona moral)"
        />
      </label>

      <div className="border-t pt-4">
        <div className="text-sm font-medium text-zinc-700">Domicilio fiscal</div>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <div className="text-sm font-medium">Código postal</div>
            <input
              value={values.codigoPostal}
              onChange={(e) =>
                updateField(values, onChange, "codigoPostal", e.target.value)
              }
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <div className="text-sm font-medium">Tipo de vialidad</div>
            <input
              value={values.tipoDeVialidad}
              onChange={(e) =>
                updateField(values, onChange, "tipoDeVialidad", e.target.value)
              }
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Calle, avenida, etc."
            />
          </label>
          <label className="block sm:col-span-2">
            <div className="text-sm font-medium">Nombre de vialidad</div>
            <input
              value={values.nombreDeVialidad}
              onChange={(e) =>
                updateField(values, onChange, "nombreDeVialidad", e.target.value)
              }
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <div className="text-sm font-medium">Número exterior</div>
            <input
              value={values.numeroExterior}
              onChange={(e) =>
                updateField(values, onChange, "numeroExterior", e.target.value)
              }
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <div className="text-sm font-medium">Número interior</div>
            <input
              value={values.numeroInterior}
              onChange={(e) =>
                updateField(values, onChange, "numeroInterior", e.target.value)
              }
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <div className="text-sm font-medium">Colonia</div>
            <input
              value={values.nombreDeLaColonia}
              onChange={(e) =>
                updateField(values, onChange, "nombreDeLaColonia", e.target.value)
              }
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <div className="text-sm font-medium">Localidad</div>
            <input
              value={values.nombreDeLaLocalidad}
              onChange={(e) =>
                updateField(values, onChange, "nombreDeLaLocalidad", e.target.value)
              }
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <div className="text-sm font-medium">Municipio</div>
            <input
              value={values.nombreDelMunicipio}
              onChange={(e) =>
                updateField(values, onChange, "nombreDelMunicipio", e.target.value)
              }
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <div className="text-sm font-medium">Entidad federativa</div>
            <input
              value={values.nombreDeLaEntidadFederativa}
              onChange={(e) =>
                updateField(
                  values,
                  onChange,
                  "nombreDeLaEntidadFederativa",
                  e.target.value,
                )
              }
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
        </div>
      </div>
    </div>
  );
}

export function customerFormValuesToCreateBody(args: {
  values: CustomerFormValues;
  organizationUrl: string;
  createdByUrl?: string | null;
}) {
  const { values, organizationUrl, createdByUrl } = args;
  return {
    name: values.name.trim(),
    legal_name: values.legalName.trim() || null,
    rfc: values.rfc.trim() || null,
    codigo_postal: values.codigoPostal.trim() || null,
    tipo_de_vialidad: values.tipoDeVialidad.trim() || null,
    nombre_de_vialidad: values.nombreDeVialidad.trim() || null,
    numero_exterior: values.numeroExterior.trim() || null,
    numero_interior: values.numeroInterior.trim() || null,
    nombre_de_la_colonia: values.nombreDeLaColonia.trim() || null,
    nombre_de_la_localidad: values.nombreDeLaLocalidad.trim() || null,
    nombre_del_municipio: values.nombreDelMunicipio.trim() || null,
    nombre_de_la_entidad_federativa:
      values.nombreDeLaEntidadFederativa.trim() || null,
    organization: organizationUrl,
    created_by: createdByUrl ?? null,
  };
}
