'use client'

import React from 'react'
import type { CertificateTypeConfig } from '@/lib/config-types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import config from '@/certifier.config'

interface Props {
  onSelect: (certConfig: CertificateTypeConfig) => void
}

export default function CertificateSelector({ onSelect }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-center">Select Certificate Type</CardTitle>
        <p className="text-muted-foreground text-center">
          Choose the type of certificate you want to obtain
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {config.certificates.map(cert => (
          <button
            key={cert.id}
            onClick={() => onSelect(cert)}
            className="w-full p-4 rounded-lg border border-border hover:border-primary hover:bg-accent transition-colors text-left"
          >
            <h3 className="font-medium">{cert.name}</h3>
            {cert.description && (
              <p className="text-sm text-muted-foreground mt-1">{cert.description}</p>
            )}
          </button>
        ))}
      </CardContent>
    </Card>
  )
}
